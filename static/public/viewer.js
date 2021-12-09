const socket = io();
const constraints = {
    video: true,
    audio: true,
};
var webRtcPeer;
var videoGrid;
var remoteVideo;
var startBtn;
var stopBtn;

window.onload = () => {
    videoGrid = document.getElementById('video-grid');
    remoteVideo = document.createElement('video');
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    videoGrid.append(remoteVideo);
    startBtn = document.getElementById('start-stream');
    startBtn.onclick = () => {
        start();
    }
    stopBtn = document.getElementById('stop-stream');
    stopBtn.onclick = () => {
        stop();
    }  
}

window.onunload = window.onbeforeunload = () => {
    socket.close();
    socket = null;
    webRtcPeer.dispose();
    webRtcPeer = null;
}

/**
 * Socket
 */
socket.emit('join-room', ROOM_ID);
socket.on('answer', (answer) => {
    console.log('Process answer');
    webRtcPeer.processAnswer(answer);
});
socket.on('icecandidate', (candidate) => {
    console.log('Process candidate');
    webRtcPeer.addIceCandidate(new RTCIceCandidate(candidate));
})
socket.on('stop', () => {
    if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
        remoteVideo.srcObject = null;
        socket.close();
        socket = null;
	}
})
/**
 * Function
 */
const start = async () => {    
    console.log('Starting receive stream ...')	

	console.log('Creating WebRtcPeer and generating local sdp offer ...');

    const options = {
      remoteVideo: remoteVideo,      
      mediaConstraints: constraints,
      onicecandidate : onIceCandidate
    }

    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
        if(error) return console.error(error);
        this.generateOffer(onOffer);
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state: ', this.peerConnection.connectionState);
        }
    });
}

const stop = () => {
    console.log('Stopping stream ...');	
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
        remoteVideo.srcObject = null;
	}
	socket.emit('stop', {
        type: 'Viewer',
        roomId: ROOM_ID
    });
}

const onIceCandidate = (candidate) => { 
    console.log('On candidate');
    socket.emit('icecandidate', {
        candidate: candidate,       
        roomId: ROOM_ID
    });
}

const onOffer = (error, offerSdp) => {
	if(error) return console.log(error);

	console.info('Invoking SDP offer callback function ' + location.host);
	socket.emit('offer', {
        offer: offerSdp,
        type: 'Viewer',
        roomId: ROOM_ID
    });
}