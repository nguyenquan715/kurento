import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import * as kurento from 'kurento-client';
import path from 'path';
import { ClientInstance, MediaPipeline, WebRtcEndpoint } from 'kurento-client';

type Room = {
    id: string; //socket id
    pipeline: MediaPipeline;
    webRtcEndpoint: WebRtcEndpoint;
};
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
app.use(express.static(path.join(__dirname, 'static')));

app.get("/", (req, res) => {    
    res.sendFile('index.html');   
});

/**
 * Socket
 */
io.on('connection', (socket: Socket) => {
    console.log('Client connected: ', socket.id);
    socket.on('offer', async ({offer}) => {
        try { 
            if(!rooms[socket.id]) {
                const pipeline: MediaPipeline = await createPipeline();
                const webRtcEndpoint: WebRtcEndpoint = await pipeline.create('WebRtcEndpoint');                
                rooms[socket.id] = {
                    id: socket.id,
                    pipeline: pipeline,
                    webRtcEndpoint: webRtcEndpoint
                }
                ;
            }
            const webRtcEndpoint = rooms[socket.id].webRtcEndpoint;
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
            //connect         
            await webRtcEndpoint.connect(webRtcEndpoint);
        } catch (err) {
            console.log(err);
        }        
    });
    socket.on('icecandidate', ({candidate}) => {
        onIceCandidate(socket.id, candidate)
    });
    socket.on('stop', () => {
        if(rooms[socket.id]) {
            stop(socket.id);
        }
    });
    socket.on('disconnect', () => {
        stop(socket.id);
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

const onIceCandidate = (roomId: string, _candidate: any) => {
    const candidate = kurento.getComplexType('IceCandidate')(_candidate);

    if (rooms[roomId]) {
        console.info('Add candidate');
        const webRtcEndpoint = rooms[roomId].webRtcEndpoint;
        webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!iceCandidates[roomId]) {
            iceCandidates[roomId] = [];
        }
        iceCandidates[roomId].push(candidate);
    }
}

const stop = (roomId: string) => {    
    if(rooms[roomId]) {
        console.log('Delete room: ', roomId);
        rooms[roomId].webRtcEndpoint.release();
        rooms[roomId].pipeline.release();
        delete rooms[roomId];
        delete iceCandidates[roomId];
    }
}


