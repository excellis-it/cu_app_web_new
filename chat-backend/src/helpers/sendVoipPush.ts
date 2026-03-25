import * as http2 from 'http2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const teamId = '97WNPLN6H9';
const keyId = 'DB4LFLXTT4';
const bundleId = 'com.excellisit.cuapp';

const privateKey = `
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgdvcwLIKyS7eLCUnl
1K5Aj0RYHXEyz7liEKK60UeWLI6gCgYIKoZIzj0DAQehRANCAATzO0YZAlyX21eA
SY2Yskt7L5cRYHkaZ5Iyd8WB8B3FW24yL8u7A2Ehmpdo39AEMaOCXeFv/GlBKmJ7
jwkik44w
-----END PRIVATE KEY-----
`;

function generateJWT(): string {
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId,
    },
    expiresIn: '20m',
  });
}

interface VoipPushData {
  deviceToken: string;
  fullName?: string;
  groupName?: string;
  groupId?: string;
  callType?: string;
  msgType?: string;
  userId?: string; // Optional userId for additional context
}

async function sendApplePush(data: VoipPushData): Promise<void> {
  const jwtToken = generateJWT();
  let isVoip = true;

if (typeof data?.msgType === 'string') {
  const normalized = data.msgType.trim().toLowerCase();
  if (normalized === 'incoming_call') {
    isVoip = true;
  }
  if (normalized === 'incoming_call_ended') {
    isVoip = false;
  }
}
  const payload = {
    aps: {
      'content-available': 1,
    },
    id: uuidv4(),
    nameCaller: `Incoming call from ${data.fullName}`,
    handle: 'videoCall',
    isVideo: data.callType !== 'audio',
    type: 1,
    endCall: data?.msgType ? 1 : 0,
    ios: {
      iconName: 'CallKitLogo',
      handleType: 'generic',
      supportsVideo: data.callType !== 'audio',
      audioSessionActive: false,
      supportsDTMF: false,
      supportsHolding: false,
      supportsGrouping: false,
      supportsUngrouping: false,
    },
    extra: {
      groupId: data.groupId,
      callType: data.callType,
      platform: 'ios',
      msgType: data?.msgType || 'incoming_call',
    },
    timestamp: Date.now(),
    grp: data.groupId,
  };


  let client: http2.ClientHttp2Session | null = null;

  try {
    client = http2.connect('https://api.push.apple.com');

    // Set up manual timeout
    const timeout = setTimeout(() => {
      client?.destroy();
    }, 10000);

    client.on('connect', () => {
      clearTimeout(timeout);
    });

    client.on('error', (err) => {
      client?.close();
    });


    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${data.deviceToken}`,
      authorization: `bearer ${jwtToken}`,
      'apns-topic': isVoip ? `${bundleId}.voip` : bundleId,
      'apns-push-type': isVoip ? 'voip' : 'background',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    request.setEncoding('utf8');

    request.on('response', (headers) => {
    });

    let response = '';
    request.on('data', (chunk) => {
      response += chunk;
    });
      console.log('check VOIP =====>', response);

    request.on('end', () => {
      client?.close();
    });

    request.on('error', (err) => {
      client?.close();
    });

    request.write(JSON.stringify(payload));
    request.end();

  } catch (err) {
    client?.destroy(); // Ensure cleanup on critical failure
  }
}

export default sendApplePush;
