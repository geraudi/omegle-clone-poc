import { useEffect, useRef, useState } from 'react';
import './App.css';
import {
  closeVideoCall,
  handleHangUpMsg,
  handleNewICECandidateMsg,
  handleVideoAnswerMsg,
  handleVideoOfferMsg,
  invite,
  mediaConstraints,
  setMyUsername,
  setOnTrackCallBack,
  setSendToServer
} from './rtc.ts';
import { Message, sendToServer } from './webSocket.ts';

let clientID = 0;

function App () {
  const ws = useRef<WebSocket>();
  const localCam = useRef<HTMLVideoElement | null>(null);
  const strangerCam = useRef<HTMLVideoElement | null>(null);
  const [text, setText] = useState<string[]>([]);
  const [username, setUsername] = useState<string>('');
  const [strangerUsername, setStrangerUsername] = useState<string>('');
  const [onlineUsers, setOnlineUsers] = useState([]);

  const hangUpCall = () => {
    closeVideoCall();

    if (localCam.current?.srcObject) {
      localCam.current.pause();
      (localCam.current.srcObject as MediaStream).getTracks().forEach(track => {
        track.stop();
      });
    }

    if (ws.current === undefined) {
      return;
    }

    sendToServer(ws.current, {
      name: username,
      target: strangerUsername,
      type: 'hang-up'
    });
  };

  const onTrack = (event: RTCTrackEvent) => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = event.streams[0];
    }
  };

  const sendInvitation = async (username: string) => {
    setStrangerUsername(username);
    await invite(username, (localCam.current as HTMLVideoElement).srcObject as MediaStream);
  };

  const connect = async () => {
    if (username === '') {
      return;
    }

    const myStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    (localCam.current as HTMLVideoElement).srcObject = myStream;

    ws.current = new WebSocket('ws://localhost:6503', ['json']);

    setOnTrackCallBack(onTrack);
    setSendToServer(((msg: Message) => sendToServer(ws.current as WebSocket, msg)));

    ws.current.onopen = (event) => {
      console.log('WebSocket Client Connected', event);
    };

    ws.current.onerror = function (evt) {
      console.dir(evt);
    };

    ws.current.onmessage = async function (evt) {
      const msg = JSON.parse(evt.data);
      console.log('Message received: ');
      console.dir(msg);
      let text = '';
      const time = new Date(msg.date);
      const timeStr = time.toLocaleTimeString();

      switch (msg.type) {
        case 'id':
          clientID = msg.id;
          console.log(clientID);
          setMyUsername(username);
          sendToServer(ws.current as WebSocket, {
            name: username,
            date: Date.now(),
            id: clientID,
            type: 'username'
          });
          break;

        case 'username':
          text = 'User ' + msg.name + ' - signed in at ' + timeStr;
          setText((previous) => [...previous, text]);
          break;

        case 'message':
          text = '(' + timeStr + ') ' + msg.name + ': ' + msg.text;
          setText((previous) => [...previous, text]);
          break;

        case 'userlist':      // Received an updated user list
          setOnlineUsers(msg.users);
          break;

        // Signaling messages: these messages are used to trade WebRTC
        // signaling information during negotiations leading up to a video
        // call.

        case 'video-offer':  // Invitation and offer to chat
          console.log('Received video chat offer from ' + msg.name);
          await handleVideoOfferMsg(msg, myStream);
          break;

        case 'video-answer':  // Callee has answered our offer
          handleVideoAnswerMsg(msg);
          break;

        case 'new-ice-candidate': // A new ICE candidate has been received
          handleNewICECandidateMsg(msg);
          break;

        case 'hang-up': // The other peer has hung up the call
          handleHangUpMsg(msg);
          break;
      }

      console.log(text);
    };
  };

  useEffect(() => {
    //clean up function
    return () => ws.current?.close();
  }, []);

  return (
    <>
      <h1>Chat</h1>
      <p>Click a username in the user list to ask them to enter a one-on-one video chat with you.</p>
      <p>Enter a username:
        <input style={{padding: '5px', marginLeft: '5px'}} type="text" value={username} onChange={e => setUsername(e.target.value)}/>
        <button onClick={connect}>Connect</button>
      </p>
      <button onClick={hangUpCall}>Hang up</button>
      <div className="camerabox">
        <video style={{border: '3px solid blue', marginRight: '10px'}} ref={strangerCam} autoPlay></video>
        <video style={{border: '3px solid green'}} ref={localCam} autoPlay></video>
      </div>

      <div id="onlineUsers">
        <ul>
          {onlineUsers.map(user => (
            <li key={user} onClick={() => sendInvitation(user)}>{user}</li>
          ))}
        </ul>
      </div>

      <div>
        {text.map((line, index) => <p key={index}>{line}</p>)}
      </div>
    </>
  );
}

export default App;
