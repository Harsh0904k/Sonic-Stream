
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { UserRole, Message, RoomState, RoomInfo, DiscoveryMessage } from './types';
import Visualizer from './components/Visualizer';
import ChatBox from './components/ChatBox';
import { getAIDJCommentary } from './services/geminiService';

const ROOM_ID_PREFIX = 'SONIC_V5_';
const REGISTRY_ID = 'SONIC_V5_REGISTRY_HUB';

type BroadcastMode = 'SYSTEM' | 'FILE' | null;

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [tempRoomId, setTempRoomId] = useState('');
  const [availableRooms, setAvailableRooms] = useState<RoomInfo[]>([]);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [showAndroidHelp, setShowAndroidHelp] = useState(false);
  
  const sessionSeed = useMemo(() => Math.random().toString(36).substring(7).toUpperCase(), []);
  const [roomState, setRoomState] = useState<RoomState>({
    id: sessionSeed,
    isLive: false,
    activeListeners: 0,
    currentVibe: 'Ready'
  });
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [audioSyncNeeded, setAudioSyncNeeded] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localPlayerRef = useRef<HTMLAudioElement | null>(null);
  const registryPeerRef = useRef<Peer | null>(null);
  const registryRoomsRef = useRef<Map<string, RoomInfo>>(new Map());

  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const addMessage = useCallback((sender: string, text: string, isAI: boolean = false) => {
    setMessages(prev => [...prev, { 
      id: Math.random().toString(36), 
      sender, 
      text, 
      timestamp: new Date(), 
      isAI 
    }].slice(-40));
  }, []);

  // Fix: Added handleSendMessage to handle message broadcasting and AI DJ triggers
  const handleSendMessage = useCallback((text: string) => {
    const sender = role === UserRole.HOST ? 'Host' : `User-${peer?.id?.slice(-4) || '...'}`;
    addMessage(sender, text);

    const chatMsg = {
      type: 'CHAT',
      sender,
      text,
      timestamp: new Date(),
    };

    connectionsRef.current.forEach(conn => {
      if (conn.open) {
        conn.send(chatMsg);
      }
    });

    // Trigger AI Commentary if Host is active and broadcasting
    if (role === UserRole.HOST && isCapturing && Math.random() > 0.6) {
      getAIDJCommentary(text).then(commentary => {
        addMessage("Sonic AI", commentary, true);
        connectionsRef.current.forEach(conn => {
          if (conn.open) {
            conn.send({
              type: 'CHAT',
              sender: 'Sonic AI',
              text: commentary,
              isAI: true,
              timestamp: new Date()
            });
          }
        });
      });
    }
  }, [role, peer, addMessage, isCapturing]);

  const startRegistryService = useCallback(() => {
    const registry = new Peer(REGISTRY_ID);
    registry.on('open', () => { registryPeerRef.current = registry; });
    registry.on('connection', (conn) => {
      conn.on('data', (data: any) => {
        const msg = data as DiscoveryMessage;
        if (msg.type === 'HEARTBEAT') {
          registryRoomsRef.current.set(msg.roomId, {
            id: msg.roomId,
            hostName: `Host ${msg.roomId}`,
            vibe: msg.vibe,
            listenerCount: msg.listenerCount,
            lastSeen: Date.now()
          });
        } else if (msg.type === 'REQUEST_ROOMS') {
          const active = Array.from(registryRoomsRef.current.values())
            .filter((r: RoomInfo) => Date.now() - r.lastSeen < 25000);
          conn.send({ type: 'ROOM_LIST', rooms: active });
        }
      });
    });
    return registry;
  }, []);

  useEffect(() => {
    if (!role || !peer) return;
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connectionsRef.current.set(conn.peer, conn);
        setRoomState(prev => ({ ...prev, activeListeners: connectionsRef.current.size }));
      });
      conn.on('data', (data: any) => {
        if (data.type === 'CHAT') {
          addMessage(data.sender, data.text, data.isAI);
          if (role === UserRole.HOST) {
            connectionsRef.current.forEach(c => { if (c.peer !== conn.peer && c.open) c.send(data); });
          }
        } else if (data.type === 'READY_FOR_STREAM' && role === UserRole.HOST) {
          if (streamRef.current && isCapturing) {
            peer.call(conn.peer, streamRef.current);
          }
        }
      });
      conn.on('close', () => {
        connectionsRef.current.delete(conn.peer);
        setRoomState(prev => ({ ...prev, activeListeners: connectionsRef.current.size }));
      });
    });
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', async (remoteStream) => {
        if (audioRef.current) {
          audioRef.current.srcObject = remoteStream;
          try {
            await audioRef.current.play();
            const ctx = await initAudio();
            const source = ctx.createMediaStreamSource(remoteStream);
            const newAnalyser = ctx.createAnalyser();
            source.connect(newAnalyser);
            setAnalyser(newAnalyser);
            setAudioSyncNeeded(false);
          } catch (e) { setAudioSyncNeeded(true); }
        }
      });
    });
  }, [role, peer, isCapturing, initAudio, addMessage]);

  // Fix: Added registry interaction for heartbeats and room list fetching
  useEffect(() => {
    if (!role || !peer) return;

    let interval: number;
    if (role === UserRole.LISTENER) {
      interval = window.setInterval(() => {
        const conn = peer.connect(REGISTRY_ID);
        conn.on('open', () => {
          conn.send({ type: 'REQUEST_ROOMS' });
          conn.on('data', (data: any) => {
            if (data.type === 'ROOM_LIST') {
              setAvailableRooms(data.rooms);
              setTimeout(() => conn.close(), 500);
            }
          });
        });
      }, 5000);
    } else if (role === UserRole.HOST && isCapturing) {
      interval = window.setInterval(() => {
        const conn = peer.connect(REGISTRY_ID);
        conn.on('open', () => {
          conn.send({
            type: 'HEARTBEAT',
            roomId: sessionSeed,
            listenerCount: connectionsRef.current.size,
            vibe: roomState.currentVibe || 'Sonic Jam'
          });
          setTimeout(() => conn.close(), 500);
        });
      }, 10000);
    }

    return () => clearInterval(interval);
  }, [role, peer, isCapturing, sessionSeed, roomState.currentVibe]);

  useEffect(() => {
    if (!role) return;
    const newPeer = new Peer(`${role === UserRole.HOST ? ROOM_ID_PREFIX : 'LIST_V5_'}${sessionSeed}`, {
      debug: 1,
      config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    newPeer.on('open', () => {
      setPeer(newPeer);
      if (role === UserRole.HOST) startRegistryService();
    });
    return () => newPeer.destroy();
  }, [role, sessionSeed, startRegistryService]);

  const startSystemBroadcast = async () => {
    const nav = navigator as any;
    const mediaDevices = nav.mediaDevices;
    const isAndroid = /Android/i.test(navigator.userAgent);
    
    // Attempt to "wake up" the media devices list (fixes some mobile browser issues)
    try { await mediaDevices?.enumerateDevices(); } catch(e) {}

    let getDisplayMedia = null;
    if (mediaDevices && mediaDevices.getDisplayMedia) {
      getDisplayMedia = mediaDevices.getDisplayMedia.bind(mediaDevices);
    } else if (nav.getDisplayMedia) {
      getDisplayMedia = nav.getDisplayMedia.bind(nav);
    }

    if (!getDisplayMedia) {
      if (isAndroid) {
        setShowAndroidHelp(true);
      } else {
        alert("System Audio Capture is not supported by this browser. Try Chrome on Desktop.");
      }
      return;
    }

    try {
      setIsActivating(true);
      // Android requires video: true to trigger the permission dialog
      const stream = await getDisplayMedia({
        video: { width: 1 }, // Request tiny video to satisfy Android requirements
        audio: true
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        alert("You must enable 'Share Audio' in the popup toggle.");
        setIsActivating(false);
        return;
      }

      const ctx = await initAudio();
      stream.getVideoTracks().forEach(t => t.stop());
      streamRef.current = stream;
      
      const source = ctx.createMediaStreamSource(stream);
      const newAnalyser = ctx.createAnalyser();
      source.connect(newAnalyser);
      setAnalyser(newAnalyser);
      
      setIsCapturing(true);
      setBroadcastMode('SYSTEM');
      setRoomState(prev => ({ ...prev, isLive: true }));
      
      connectionsRef.current.forEach(conn => { if (conn.open) peer?.call(conn.peer, stream); });
      addMessage("System", "System Relay Active.");
      audioTracks[0].onended = () => stopBroadcast();
    } catch (err: any) {
      console.error(err);
      if (err.name !== 'NotAllowedError') alert(`Capture failed: ${err.message}`);
    } finally {
      setIsActivating(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !localPlayerRef.current) return;
    const url = URL.createObjectURL(file);
    localPlayerRef.current.src = url;
    try {
      await localPlayerRef.current.play();
      const ctx = await initAudio();
      // @ts-ignore
      const stream = localPlayerRef.current.captureStream?.() || localPlayerRef.current.mozCaptureStream?.();
      if (!stream) { alert("File streaming unavailable."); return; }
      streamRef.current = stream;
      const source = ctx.createMediaElementSource(localPlayerRef.current);
      const newAnalyser = ctx.createAnalyser();
      source.connect(newAnalyser);
      source.connect(ctx.destination);
      setAnalyser(newAnalyser);
      setIsCapturing(true);
      setBroadcastMode('FILE');
      setRoomState(prev => ({ ...prev, isLive: true }));
      connectionsRef.current.forEach(conn => { if (conn.open) peer?.call(conn.peer, stream); });
      addMessage("System", `Streaming: ${file.name}`);
    } catch (err) { alert("Playback failed."); }
  };

  const stopBroadcast = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (localPlayerRef.current) { localPlayerRef.current.pause(); localPlayerRef.current.src = ""; }
    streamRef.current = null;
    setIsCapturing(false);
    setBroadcastMode(null);
    setRoomState(prev => ({ ...prev, isLive: false }));
    addMessage("System", "Broadcast ended.");
  };

  const handleJoinRoom = async (targetId: string) => {
    if (!peer) return;
    await initAudio();
    const fullId = targetId.startsWith(ROOM_ID_PREFIX) ? targetId : `${ROOM_ID_PREFIX}${targetId}`;
    const conn = peer.connect(fullId, { reliable: true });
    conn.on('open', () => {
      connectionsRef.current.set(fullId, conn);
      setIsJoined(true);
      setRoomState(prev => ({ ...prev, id: targetId.toUpperCase(), isLive: true }));
      addMessage("System", `Linked to station. Awaiting audio...`);
      setTimeout(() => { if (conn.open) conn.send({ type: 'READY_FOR_STREAM' }); }, 1500);
    });
  };

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0c] p-6">
        <div className="max-w-md w-full glass-panel rounded-3xl p-10 border border-white/5 shadow-2xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3">
              <i className="fas fa-wave-square text-2xl text-white"></i>
            </div>
            <h1 className="text-3xl font-extrabold heading-font text-white italic tracking-tighter">SONICSTREAM</h1>
            <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest font-bold">Audio Relay P2P</p>
          </div>
          <div className="space-y-4">
            <button onClick={() => { setRole(UserRole.HOST); setIsJoined(true); }} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-5 px-6 rounded-2xl transition-all flex items-center gap-4">
              <i className="fas fa-tower-broadcast text-xl"></i>
              <div className="text-left"><span className="block">Host Station</span><span className="text-[10px] opacity-60">Broadcast your sound</span></div>
            </button>
            <button onClick={() => { setRole(UserRole.LISTENER); initAudio(); }} className="w-full bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-5 px-6 rounded-2xl transition-all flex items-center gap-4 border border-white/10">
              <i className="fas fa-headphones text-xl"></i>
              <div className="text-left"><span className="block">Join Channel</span><span className="text-[10px] opacity-60">Listen to live audio</span></div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (role === UserRole.LISTENER && !isJoined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0c] p-6">
        <div className="max-w-2xl w-full glass-panel rounded-3xl p-8 border border-white/5">
          <button onClick={() => setRole(null)} className="mb-6 text-gray-500 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><i className="fas fa-arrow-left"></i> Back</button>
          <h2 className="text-2xl font-extrabold text-white mb-6 italic tracking-tight">Active Transmissions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
            {availableRooms.length > 0 ? availableRooms.map(room => (
              <button key={room.id} onClick={() => handleJoinRoom(room.id)} className="text-left p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500 transition-all group">
                <h4 className="font-bold text-white uppercase text-sm group-hover:text-cyan-400">STATION {room.id}</h4>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400 font-mono">
                  <span><i className="fas fa-users text-cyan-500"></i> {room.listenerCount}</span>
                  <span className="uppercase">{room.vibe}</span>
                </div>
              </button>
            )) : <div className="col-span-full py-16 text-center text-gray-700 text-sm font-bold uppercase tracking-widest italic border-2 border-dashed border-white/5 rounded-3xl">Scanning Signals...</div>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if(tempRoomId) handleJoinRoom(tempRoomId); }} className="flex gap-2">
            <input type="text" value={tempRoomId} onChange={(e) => setTempRoomId(e.target.value.toUpperCase())} placeholder="DIRECT CHANNEL ID" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-sm font-mono text-cyan-400 tracking-widest" />
            <button type="submit" className="bg-cyan-600 text-white px-8 rounded-xl font-bold uppercase text-xs">Tune In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0a0c]" onClick={() => initAudio()}>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      <audio ref={localPlayerRef} crossOrigin="anonymous" className="hidden" />
      
      {showAndroidHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm">
          <div className="max-w-md w-full glass-panel border border-cyan-500/30 rounded-3xl p-8 text-center shadow-2xl">
            <i className="fas fa-mobile-screen text-5xl text-cyan-500 mb-6"></i>
            <h3 className="text-xl font-bold text-white mb-4 italic">Android: System Capture Required</h3>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Chrome for Android hides "System Relay" by default. To unlock it:
            </p>
            <div className="space-y-4 text-left mb-8">
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center font-bold">1</div>
                <p className="text-xs text-gray-300">Tap the <b>three dots (⋮)</b> in the top right of Chrome.</p>
              </div>
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center font-bold">2</div>
                <p className="text-xs text-gray-300">Check the box for <b>"Desktop site"</b>.</p>
              </div>
              <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center font-bold">3</div>
                <p className="text-xs text-gray-300">Return here and tap <b>System Relay</b> again.</p>
              </div>
            </div>
            <button onClick={() => setShowAndroidHelp(false)} className="w-full py-4 bg-cyan-600 text-white rounded-xl font-bold uppercase text-xs">Got it, I'll switch</button>
          </div>
        </div>
      )}

      <div className="w-full md:w-80 flex flex-col p-6 border-r border-white/5 bg-black/40">
        <header className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center shadow-lg"><i className="fas fa-wave-square text-white text-xs"></i></div>
          <h1 className="text-lg font-extrabold text-white italic tracking-tight">SONICSTREAM</h1>
        </header>

        <div className="flex-1 space-y-6">
          <div className="glass-panel rounded-2xl p-5 border border-white/5">
            <span className="text-[10px] font-bold text-gray-600 uppercase mb-4 block tracking-widest">Station Meta</span>
            <div className="space-y-3">
              <div className="bg-black/40 rounded-lg p-2 text-center"><span className="text-[10px] text-gray-600 block mb-1">STATION ID</span><span className="font-mono text-cyan-400 text-xs tracking-widest font-bold">{roomState.id}</span></div>
              <div className="flex gap-2">
                <div className="flex-1 bg-white/5 rounded-lg p-2 text-center border border-white/5"><span className="text-[8px] text-gray-600 block mb-1 uppercase font-bold">Active</span><span className="font-bold text-white text-sm">{roomState.activeListeners}</span></div>
                <div className="flex-1 bg-white/5 rounded-lg p-2 text-center border border-white/5"><span className="text-[8px] text-gray-600 block mb-1 uppercase font-bold">Stream</span><span className="font-bold text-cyan-400 text-[10px]">P2P-HD</span></div>
              </div>
            </div>
          </div>

          {role === UserRole.HOST && !isCapturing && (
            <div className="space-y-3">
               <label className="w-full bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 font-bold py-4 px-4 rounded-xl transition-all flex items-center gap-3 border border-cyan-500/30 cursor-pointer group">
                 <i className="fas fa-file-audio text-lg"></i>
                 <div className="text-left"><span className="block text-[11px] uppercase tracking-tighter">Choose Audio File</span><span className="text-[9px] font-normal opacity-60 italic">Native Mobile Support</span></div>
                 <input type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
               </label>
               <button onClick={startSystemBroadcast} disabled={isActivating} className={`w-full ${isActivating ? 'opacity-50' : ''} bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-4 px-4 rounded-xl flex items-center gap-3 border border-white/10 transition-all`}>
                 <i className="fas fa-microchip text-purple-500 text-lg"></i>
                 <div className="text-left"><span className="block text-[11px] uppercase tracking-tighter">System Relay</span><span className="text-[9px] font-normal opacity-40 italic">Global Device Sound</span></div>
               </button>
            </div>
          )}

          {isCapturing && (
             <button onClick={stopBroadcast} className="w-full py-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-500 font-bold flex items-center justify-center gap-2 shadow-lg transition-all hover:bg-red-500 hover:text-white">
               <i className="fas fa-stop-circle"></i> KILL TRANSMISSION
             </button>
          )}

          {audioSyncNeeded && (
            <button onClick={() => initAudio()} className="w-full p-5 bg-cyan-600/20 border border-cyan-500/30 rounded-xl text-cyan-400 font-bold text-xs flex items-center justify-center gap-3 animate-pulse shadow-xl">
              <i className="fas fa-bolt text-lg"></i> RE-SYNC SIGNAL
            </button>
          )}
        </div>
        
        <div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/5">
          <p className="text-[9px] text-gray-500 leading-relaxed italic uppercase font-bold tracking-tighter">
            PRO-TIP: If "System Relay" is missing on Android, use the Chrome menu (⋮) to toggle "Desktop site".
          </p>
        </div>
      </div>

      <main className="flex-1 flex flex-col p-6 overflow-hidden">
        <h2 className="text-4xl font-extrabold text-white mb-8 italic tracking-tighter uppercase">{role === UserRole.HOST ? 'Host Console' : 'Reception Deck'}</h2>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          <div className="lg:col-span-2 flex flex-col gap-6 h-full">
            <div className="flex-1 min-h-[300px] glass-panel rounded-3xl border border-white/5 p-8 bg-black/40 overflow-hidden relative">
              <Visualizer analyser={analyser} isActive={isCapturing || (role === UserRole.LISTENER && isJoined)} />
              <div className="absolute top-6 right-6 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCapturing ? 'bg-cyan-500 pulsing' : 'bg-gray-800'}`}></span>
                <span className="text-[10px] font-mono text-gray-500 uppercase font-bold italic tracking-widest">{isCapturing ? 'Stream Live' : 'No Signal'}</span>
              </div>
            </div>
          </div>
          <div className="h-full min-h-[400px]"><ChatBox messages={messages} onSendMessage={handleSendMessage} /></div>
        </div>
      </main>
    </div>
  );
};

export default App;
