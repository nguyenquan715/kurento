const socket = io();
const constraints = {
    video: true,
    audio: true,
};

const stopCall = (webRtcPeer, video, type) => {
  console.log('Stopping video stream ...');	
  if (webRtcPeer) {
    webRtcPeer.dispose();
    webRtcPeer = null;
    video.srcObject = null;
  }
  socket.emit('stop', {
    type: type,
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

const onOffer = (error, offerSdp, type) => {
  if(error) return console.log(error);

  console.info('Invoking SDP offer callback function ' + location.host);
  socket.emit('offer', {
    offer: offerSdp,
    type: type,
    roomId: ROOM_ID
  });
}