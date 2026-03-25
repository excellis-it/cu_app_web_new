import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Videocam as VideocamIcon,
  VideocamOff as VideocamOffIcon,
  Chat as ChatIcon,
  ScreenShare as ScreenShareIcon,
  StopScreenShare as StopScreenShareIcon,
} from "@mui/icons-material";

const BottomBar = ({
  clickChat,
  clickCameraDevice,
  goToBack,
  toggleCameraAudio,
  userVideoAudio,
  clickScreenSharing,
  screenShare,
  videoDevices,
  showVideoDevices,
  setShowVideoDevices,
  callType,
  hasRealDevices,
  hasCamera,
  hasMic,
  currentScreenSharer,
  isGuestMeeting
}) => {
  const handleToggle = useCallback(() => {
    setShowVideoDevices((state) => !state);
  }, [setShowVideoDevices]);
  const [leaving, setLeaving] = useState(false)
  const handelLeaving = async (e) => {
    e.preventDefault()
    setLeaving(true)
    setTimeout(() => { (goToBack(e), setLeaving(false)) }, 2000)

  }

  return (
    <Bar>
      <Left>
        {callType === 'video' && (
          <DeviceButton
            onClick={() => toggleCameraAudio('video')}
            $active={userVideoAudio.video}
            style={{ cursor: hasCamera ? 'pointer' : 'default' }}
            title={hasCamera ? "" : "No camera available"}
          >
            {userVideoAudio.video ? <VideocamIcon /> : <VideocamOffIcon />}
          </DeviceButton>
        )}

        {hasRealDevices && showVideoDevices && (
          <SwitchList>
            {videoDevices.map((device) => (
              <div
                key={device.deviceId}
                onClick={clickCameraDevice}
                data-value={device.deviceId}
              >
                {device.label}
              </div>
            ))}
            <div>Switch Camera</div>
          </SwitchList>
        )}

        {hasRealDevices && (
          <SwitchMenu onClick={handleToggle}>
            <i className="fas fa-angle-up" />
          </SwitchMenu>
        )}

        <DeviceButton
          onClick={() => toggleCameraAudio('audio')}
          $active={userVideoAudio.audio}
          style={{ cursor: hasMic ? 'pointer' : 'default' }}
          title={hasMic ? "" : "No microphone available"}
        >
          {userVideoAudio.audio ? <MicIcon /> : <MicOffIcon />}
        </DeviceButton>
      </Left>

      {/* in call chat and share screen  */}

      <Center>
        {(sessionStorage.getItem("isGuestMeeting") === "true") && (
          <ActionButton onClick={clickChat} title="Chat" style={{ cursor: 'pointer', borderRadius: '15px', background: '#f37e20' }}>
            <ChatIcon style={{ fontSize: 'calc(16px + 1vmin)' }} />
            {/* Chat */}
          </ActionButton>
        )}

        {/* Screen share icon/button disabled */}
        {/* <ActionButton
          onClick={clickScreenSharing}
          disabled={currentScreenSharer && !screenShare}
          style={{
            opacity: (currentScreenSharer && !screenShare) ? 0.5 : 1,
            cursor: (currentScreenSharer && !screenShare) ? 'not-allowed' : 'pointer',
            background: (currentScreenSharer && !screenShare) ? '#f37e20' : '#f37e20',
            borderRadius: '15px'
          }}
          title={
            currentScreenSharer && !screenShare
              ? `${currentScreenSharer.userName} is currently sharing`
              : ''
          }
        >
          {screenShare ? (
            <StopScreenShareIcon style={{ fontSize: 'calc(16px + 1vmin)' }} />
          ) : (
            <ScreenShareIcon style={{ fontSize: 'calc(16px + 1vmin)' }} />
          )}
        </ActionButton> */}
      </Center>

      <Right>
        <StopButton onClick={handelLeaving}>{!leaving ? 'Leave Call' : "Leaving ..."}</StopButton>
      </Right>
    </Bar>
  );
};

const Bar = styled.div`
  position: absolute;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 500;
  background-color: #f2f2f2;
`;

const Left = styled.div`
  display: flex;
  align-items: center;
  margin-left: 15px;
`;

const Center = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 20px;
`;

const Right = styled.div`
  margin-right: 15px;
`;

const ActionButton = styled.div`
  width: auto;
  font-size: 0.9375rem;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 5px;

  :hover {
    background-color: #000;
    cursor: pointer;
    border-radius: 15px;
  }

  * {
    pointer-events: none;
  }

  .sharing {
    color: #f37e20;
  }
`;

const DeviceButton = styled.div`
  position: relative;
  width: auto;
  padding: 5px 10px;
  font-size: 0.9375rem;
  margin-right: 10px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  gap: 5px;
  background-color: ${(props) => (props.$active ? '#f37e20' : '#f37e20')};
  color: ${(props) => (props.$active ? 'black' : 'black')};


  .fa-microphone-slash,
  .fa-video-slash {
    color: black;
  }
`;

const FaIcon = styled.i`
  font-size: calc(16px + 1vmin);
  color: ${(props) => (props.active === false ? '#fff' : '#fff')};
`;

const StopButton = styled.div`
  width: 90px;
  height: 30px;
  font-size: 0.9375rem;
  line-height: 30px;
  background-color: #f37e20;
  border-radius: 15px;
  text-align: center;
  cursor: pointer;

 &:hover {
    background-color: #f37e20;
    cursor: pointer;
  }
`;

const SwitchMenu = styled.div`
  display: flex;
  position: absolute;
  width: 20px;
  top: 7px;
  left: 80px;
  z-index: 1;

  :hover {
    background-color: #476d84;
    cursor: pointer;
    border-radius: 15px;
  }

  * {
    pointer-events: none;
  }

  > i {
    font-size: calc(10px + 1vmin);
  }
`;

const SwitchList = styled.div`
  display: flex;
  flex-direction: column;
  position: absolute;
  top: -70px;
  left: 80px;
  background-color: #4ea1d3;
  color: white;
  padding: 5px 10px;
  border-radius: 8px;
  box-shadow: 0px 2px 6px rgba(0,0,0,0.2);

  > div {
    font-size: 0.85rem;
    padding: 4px 0;
    margin-bottom: 5px;

    :not(:last-child):hover {
      background-color: #77b7dd;
      cursor: pointer;
      border-radius: 5px;
      padding-left: 5px;
    }
  }

  > div:last-child {
    border-top: 1px solid white;
    cursor: default !important;
    opacity: 0.6;
    margin-top: 5px;
    padding-top: 5px;
  }
`;

export default BottomBar;