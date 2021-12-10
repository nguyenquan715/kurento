var webRtcPeer;
var videoGrid;
var localVideo;
var startBtn;
var stopBtn;

window.onload = () => {
    videoGrid = document.getElementById('video-grid');
    localVideo = document.createElement('video');
    localVideo.autoplay = true;
    localVideo.playsInline = true;
    videoGrid.append(localVideo);
    startBtn = document.getElementById('start-stream');
    startBtn.onclick = () => {
        startSend();
    }  
    stopBtn = document.getElementById('stop-stream');
    stopBtn.onclick = () => {
        stopCall(webRtcPeer, localVideo, 'Broadcaster');
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

/**
 * Function
 */
const startSend = async () => {    
    console.log('Starting video stream ...')	

	console.log('Creating WebRtcPeer and generating local sdp offer ...');

    const options = {
      localVideo: localVideo,      
      mediaConstraints: constraints,
      onicecandidate : onIceCandidate
    }

    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
        if(error) return console.error(error);
        this.generateOffer((error, offer) => {
            onOffer(error, offer, 'Broadcaster');
        });
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state: ', this.peerConnection.connectionState);
        }
    });
}