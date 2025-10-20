/**
 * QR-Connect Service
 * Handles direct P2P connections via QR code without traditional signaling server
 */

import { defaultStun } from "./webrtc";

export interface QRConnectOffer {
  type: 'clevrsend-qr-offer';
  version: string;
  peerId: string;
  peerAlias: string;
  offer: RTCSessionDescriptionInit;
  timestamp: number;
}

export interface QRConnectAnswer {
  type: 'clevrsend-qr-answer';
  peerId: string;
  answer: RTCSessionDescriptionInit;
}

/**
 * Generate WebRTC offer for QR code
 */
export async function generateQRConnectOffer(
  alias: string
): Promise<{ qrData: string; peerId: string; pc: RTCPeerConnection; dataChannel: RTCDataChannel }> {

  // Create unique peer ID
  const peerId = crypto.randomUUID();

  // Create RTCPeerConnection with STUN servers
  const pc = new RTCPeerConnection({
    iceServers: [
      ...defaultStun.map(url => ({ urls: url })),
      // Add free TURN server as fallback
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });

  // Create data channel for file transfer
  const dataChannel = pc.createDataChannel('files', {
    ordered: true
  });

  // Setup data channel event listeners
  dataChannel.addEventListener('open', () => {
    console.log('QR-Connect: Data channel opened (sender)');
  });

  dataChannel.addEventListener('close', () => {
    console.log('QR-Connect: Data channel closed (sender)');
  });

  dataChannel.addEventListener('error', (error) => {
    console.error('QR-Connect: Data channel error (sender):', error);
  });

  // Create offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to complete
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
    } else {
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);

      // Timeout after 5 seconds
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    }
  });

  // Create QR data object
  const qrOfferData: QRConnectOffer = {
    type: 'clevrsend-qr-offer',
    version: '1.0',
    peerId,
    peerAlias: alias,
    offer: pc.localDescription!.toJSON(),
    timestamp: Date.now()
  };

  // Create deep link URL for QR code
  // Use base64url encoding to make it URL-safe
  const offerJson = JSON.stringify(qrOfferData);
  const offerBase64 = btoa(offerJson)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Create clickable URL that opens ClevrSend with connection data
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://clevrsend.vercel.app';
  const qrData = `${appUrl}/?qr=${offerBase64}`;

  return { qrData, peerId, pc, dataChannel };
}

/**
 * Process scanned QR code and create answer
 */
export async function processQRConnectOffer(
  qrData: string,
  localAlias: string
): Promise<{ peerId: string; peerAlias: string; pc: RTCPeerConnection; answer: string }> {

  // Parse QR data - could be URL or direct JSON
  let offerData: QRConnectOffer;

  try {
    // Try to extract from URL format first
    if (qrData.includes('/?qr=')) {
      const url = new URL(qrData);
      const base64Data = url.searchParams.get('qr');
      if (!base64Data) {
        throw new Error('No QR parameter found in URL');
      }

      // Decode base64url
      const base64 = base64Data
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const jsonStr = atob(base64);
      offerData = JSON.parse(jsonStr);
    } else {
      // Fallback to direct JSON (for backwards compatibility)
      offerData = JSON.parse(qrData);
    }
  } catch (error) {
    throw new Error('Invalid QR code format');
  }

  // Validate QR data
  if (offerData.type !== 'clevrsend-qr-offer') {
    throw new Error('Invalid QR code: Not a ClevrSend QR-Connect code');
  }

  // Create RTCPeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [
      ...defaultStun.map(url => ({ urls: url })),
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });

  // Set remote description from QR code
  await pc.setRemoteDescription(new RTCSessionDescription(offerData.offer));

  // Create answer
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Wait for ICE gathering
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
    } else {
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);

      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    }
  });

  // Create answer data
  const answerData: QRConnectAnswer = {
    type: 'clevrsend-qr-answer',
    peerId: crypto.randomUUID(),
    answer: pc.localDescription!.toJSON()
  };

  const answerString = JSON.stringify(answerData);

  return {
    peerId: offerData.peerId,
    peerAlias: offerData.peerAlias,
    pc,
    answer: answerString
  };
}

/**
 * Complete connection by processing answer (for sender)
 */
export async function completeQRConnection(
  pc: RTCPeerConnection,
  answerData: string
): Promise<void> {
  const answer: QRConnectAnswer = JSON.parse(answerData);

  if (answer.type !== 'clevrsend-qr-answer') {
    throw new Error('Invalid answer data');
  }

  await pc.setRemoteDescription(new RTCSessionDescription(answer.answer));
}

/**
 * Setup event listeners for P2P connection
 */
export function setupQRConnectionListeners(
  pc: RTCPeerConnection,
  callbacks: {
    onConnected?: () => void;
    onDisconnected?: () => void;
    onDataChannel?: (channel: RTCDataChannel) => void;
    onError?: (error: Error) => void;
  }
) {
  pc.addEventListener('connectionstatechange', () => {
    console.log('QR-Connect: Connection state:', pc.connectionState);

    if (pc.connectionState === 'connected') {
      callbacks.onConnected?.();
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      callbacks.onDisconnected?.();
    }
  });

  pc.addEventListener('datachannel', (event) => {
    console.log('QR-Connect: Data channel received', event.channel.label, 'readyState:', event.channel.readyState);

    // Setup event listeners for the received channel
    event.channel.addEventListener('open', () => {
      console.log('QR-Connect: Received data channel opened');
    });

    event.channel.addEventListener('close', () => {
      console.log('QR-Connect: Received data channel closed');
    });

    event.channel.addEventListener('error', (error) => {
      console.error('QR-Connect: Received data channel error:', error);
    });

    callbacks.onDataChannel?.(event.channel);
  });

  pc.addEventListener('iceconnectionstatechange', () => {
    console.log('QR-Connect: ICE connection state:', pc.iceConnectionState);

    if (pc.iceConnectionState === 'failed') {
      callbacks.onError?.(new Error('ICE connection failed'));
    }
  });
}
