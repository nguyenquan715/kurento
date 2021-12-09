const socket = io();
const constraints = {
    video: true,
    audio: true,
};
var webRtcPeer;
var videoInput;
var videoOutput;
var startBtn;
var stopBtn;

window.onload = () => {
    videoInput = document.getElementById('videoInput');
    videoOutput = document.getElementById('videoOutput');
    startBtn = document.getElementById('start');
    stopBtn = document.getElementById('stop');
    startBtn.onclick = () => {
        start();
    }
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
const start = async () => {    
    console.log('Starting video call ...')	

	console.log('Creating WebRtcPeer and generating local sdp offer ...');

    var options = {
      localVideo: videoInput,
      remoteVideo: videoOutput,
      mediaConstraints: constraints,
      onicecandidate : onIceCandidate
    }

    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error) {
        if(error) return console.error(error);
        this.generateOffer(onOffer);
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state: ', this.peerConnection.connectionState);
        }
    });
}

const stop = () => {
    console.log('Stopping video call ...');	
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	socket.emit('stop');
}

const onIceCandidate = (candidate) => { 
    console.log('On candidate');
    socket.emit('icecandidate', {
        candidate: candidate
    });
}

const onOffer = (error, offerSdp) => {
	if(error) return console.log(error);

	console.info('Invoking SDP offer callback function ' + location.host);
	socket.emit('offer', {
        offer: offerSdp
    });
}