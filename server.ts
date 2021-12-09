import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as kurento from 'kurento-client';
import path from 'path';
import { ClientInstance, MediaPipeline, WebRtcEndpoint } from 'kurento-client';
import { v4 as uuidV4 } from 'uuid';

type Participant = {
    type: Actor,
    socket: Socket,
    rtcEndpoint: WebRtcEndpoint
}
type Room = {
    id: string; //room id
    pipeline: MediaPipeline;    
    participants: Record<string, Participant>;
    broadcaster: Participant;
};

enum Actor {
    BROADCASTER = 'Broadcaster',
    VIEWER = 'Viewer'
}
/**
 * Declaration
 */
const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = 5000;
const WS = 'ws://localhost:8888/kurento';
const rooms: Record<string, Room> = {};
const iceCandidates: Record<string, RTCIceCandidate[]> = {};

/**
 * Express
 */
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'static')));

//route
app.get("/broadcaster", (req, res) => {
    res.redirect(`/broadcaster/${uuidV4()}`);
});
  
app.get("/broadcaster/:room", (req, res) => {
    res.render("room_broadcaster", { roomId: req.params.room });
});

app.get("/viewer", (req, res) => {
    res.redirect(`/viewer/${uuidV4()}`);
});
  
app.get("/viewer/:room", (req, res) => {
    res.render("room_viewer", { roomId: req.params.room });
});

/**
 * Socket
 */
io.on('connection', (socket: Socket) => {
    console.log('Client connected: ', socket.id);
    socket.on('join-room', async (roomId) => {
        socket.join(roomId);
        createRoom(roomId);
    });
    socket.on('offer', async ({offer, type, roomId}) => {        
        try { 
            if(!rooms[roomId]) {
               await createRoom(roomId);
            }
            const webRtcEndpoint = await rooms[roomId].pipeline.create('WebRtcEndpoint');
            //offer & answer
            console.log('Process offer');   
            const answer = await webRtcEndpoint.processOffer(offer);
            console.log('Generate answer');
            socket.emit('answer', answer);
            //candidate            
            if (iceCandidates[socket.id]) {
                while(iceCandidates[socket.id].length) {
                    console.log('Add ice candidate');
                    const candidate = iceCandidates[socket.id].shift();
                    // @ts-ignore
                    webRtcEndpoint.addIceCandidate(candidate);
                }                
            }
            webRtcEndpoint.on('OnIceCandidate', event => {
                const candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                console.log('On ice candidate');
                socket.emit('icecandidate', candidate);
            }); 
            webRtcEndpoint.gatherCandidates(function(error) {
                if (error) {
                    return console.log(error);
                }
            }); 
            const participant: Participant = {
                type: type,
                socket: socket,
                rtcEndpoint: webRtcEndpoint,
            };
            rooms[roomId].participants[socket.id] = participant;
            //connect 
            connectOneToMany(roomId, participant);
        } catch (err) {
            console.log(err);
        }        
    });
    socket.on('icecandidate', ({candidate, roomId}) => {
        onIceCandidate(roomId, socket.id, candidate)
    });
    socket.on('stop', ({roomId, type}) => {
        stop(roomId, type, socket);
    });
    socket.on('disconnect', () => {
        disconnect(socket); 
    });
});

/**
 * Run server
 */
server.listen(PORT, () => {
    console.log(`Server is listening on: http://localhost:${PORT}`);
});

/**
 * Function
 */
const getKurentoClient = (): Promise<ClientInstance> => {
    console.log('Get kurento client');
    return kurento.getSingleton(WS);
}

const createPipeline = async (): Promise<MediaPipeline> => {    
        const kurentoClient: ClientInstance = await getKurentoClient();
        console.log('Create pipeline');
        return kurentoClient.create('MediaPipeline'); 
}

const createRoom = async (roomId: string) => {
    if(rooms[roomId]) return;
    const pipeline: MediaPipeline = await createPipeline();
    rooms[roomId] = {
        id: roomId,
        pipeline: pipeline,
        participants: {},
        // @ts-ignore
        broadcaster: {},
    };

}

const onIceCandidate = (roomId: string, socketId: string, _candidate: any) => {
    const candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (rooms[roomId] && rooms[roomId].participants[socketId]) {
        console.info('Add candidate');
        const webRtcEndpoint = rooms[roomId].participants[socketId].rtcEndpoint;
        webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!iceCandidates[socketId]) {
            iceCandidates[socketId] = [];
        }
        iceCandidates[socketId].push(candidate);
    }
}

const connectOneToMany = async (roomId: string, participantJoin: Participant) => {
    const participants = rooms[roomId].participants;
    const keyOfParticipants = Object.keys(participants);
    if(participantJoin.type == Actor.BROADCASTER){
        rooms[roomId].broadcaster = participantJoin;
        if(keyOfParticipants.length > 1) {
            keyOfParticipants.forEach(key => {
                const participant: Participant = participants[key];
                if(participant.type == Actor.VIEWER){
                    rooms[roomId].broadcaster.rtcEndpoint.connect(participant.rtcEndpoint);
                }
            });
        }
    }
    if(participantJoin.type == Actor.VIEWER && rooms[roomId].broadcaster) {
        rooms[roomId].broadcaster.rtcEndpoint.connect(participantJoin.rtcEndpoint);
    }
}

const stop = (roomId: string, type: string, socket: Socket) => {    
    if(rooms[roomId]){
        if(type === Actor.BROADCASTER) {
            rooms[roomId].pipeline.release();
            rooms[roomId].broadcaster.rtcEndpoint.release();
            Object.keys(rooms[roomId].participants).forEach(key => {
                rooms[roomId].participants[key].rtcEndpoint.release();
                delete rooms[roomId].participants[key];
            });
            console.log('Delete room: ', roomId);
            delete rooms[roomId];
            socket.to(roomId).emit('stop');
        }
        if(type === Actor.VIEWER) {
            rooms[roomId].participants[socket.id].rtcEndpoint.release();
            delete rooms[roomId].participants[socket.id];
        }
    }
}

const disconnect = (socket: Socket) => {
    for(let key in rooms) {
        if(rooms[key].participants[socket.id]) {
            if(rooms[key].participants[socket.id].type == Actor.BROADCASTER) {
                rooms[key].broadcaster.rtcEndpoint.release();
            }
            rooms[key].participants[socket.id].rtcEndpoint.release();
            delete rooms[key].participants[socket.id];
            if(Object.keys(rooms[key].participants).length == 0) {
                console.log('Delete room: ', key);
                delete rooms[key];
            }
        }
    }
}


