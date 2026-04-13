// src/components/meetings/LiveMeetingAssistant.tsx
// Cluely-style real-time AI meeting assistant
// Listens to microphone, transcribes in real-time, suggests follow-up questions

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';
import { Mic, MicOff, Sparkles, X, ChevronRight, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

interface AISuggestions {
  follow_up_questions: string[];
  points_to_raise: string[];
  action_items_detected: string[];
  suggested_response: string;
}

export const LiveMeetingAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('Current Meeting');

  const recognitionRef = useRef<any>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const getSuggestions = useCallback(async (currentTranscript: string) => {
    if (currentTranscript.length < 100) return;
    setLoadingSuggestions(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      const resp = await fetch(apiUrl('/api/meetings/ai-assist'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: currentTranscript, meetingTitle }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSuggestions(data);
      }
    } catch (e) {
      console.error('AI assist error:', e);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [meetingTitle]);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser. Use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let fullTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript + ' ';
      }
      setTranscript(fullTranscript);

      // Debounce AI suggestions — get every 10 seconds of new content
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        getSuggestions(fullTranscript);
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) recognition.start(); // Auto-restart
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    toast.success('Live AI assistant started');
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const saveMeeting = async () => {
    if (!transcript) return;
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      // Save transcript to database
      await supabase.from('meeting_transcripts').insert({
        organization_id: (await supabase.auth.getUser()).data.user?.user_metadata?.organization_id,
        platform: 'meet',
        title: meetingTitle,
        transcript,
        status: 'pending',
        meeting_date: new Date().toISOString(),
      });
      toast.success('Meeting saved and processing...');
      setTranscript('');
      setSuggestions(null);
    } catch {
      toast.error('Failed to save meeting');
    }
  };

  if (!isOpen) return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-4 right-4 w-14 h-14 rounded-full bg-[#0F766E] text-white flex items-center justify-center shadow-[0_4px_20px_rgba(45,212,191,0.4)] hover:shadow-[0_4px_24px_rgba(45,212,191,0.6)] hover:scale-105 transition-all duration-200 z-[9999]"
      title="AI Meeting Assistant"
    >
      <Mic className="w-5 h-5" />
    </button>
  );

  return (
    <div className="fixed bottom-20 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-[#F0FDFA] to-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#2DD4BF] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-gray-900">AI Meeting Assistant</span>
          {isListening && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}
        </div>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Meeting title input */}
      <div className="px-4 pt-3">
        <input
          value={meetingTitle}
          onChange={e => setMeetingTitle(e.target.value)}
          placeholder="Meeting title..."
          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#2DD4BF] text-gray-700"
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2 px-4 py-3">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
            isListening
              ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
              : 'bg-[#1C1917] text-white hover:bg-[#292524]'
          }`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {isListening ? 'Stop' : 'Start listening'}
        </button>
        {transcript && (
          <button
            onClick={saveMeeting}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-all"
          >
            Save
          </button>
        )}
      </div>

      {/* Live transcript preview */}
      {transcript && (
        <div className="px-4 pb-2">
          <div className="bg-gray-50 rounded-xl p-2.5 max-h-16 overflow-hidden">
            <p className="text-xs text-gray-500 line-clamp-3">{transcript.slice(-200)}</p>
          </div>
        </div>
      )}

      {/* AI Suggestions */}
      <div className="px-4 pb-4 space-y-3">
        {loadingSuggestions && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Analyzing...
          </div>
        )}

        {suggestions && !loadingSuggestions && (
          <>
            {/* Suggested response */}
            {suggestions.suggested_response && (
              <div className="bg-[#F0FDFA] rounded-xl p-3 border border-[#CCFBF1]">
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3 h-3 text-[#0F766E]" />
                  <span className="text-[10px] font-medium text-[#0F766E] uppercase tracking-wide">Suggested response</span>
                </div>
                <p className="text-xs text-gray-700">{suggestions.suggested_response}</p>
              </div>
            )}

            {/* Follow-up questions */}
            {suggestions.follow_up_questions?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Ask next</p>
                <div className="space-y-1">
                  {suggestions.follow_up_questions.slice(0, 3).map((q, i) => (
                    <div key={i} className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                      <ChevronRight className="w-3 h-3 text-[#2DD4BF] mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-700">{q}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action items detected */}
            {suggestions.action_items_detected?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Action items detected</p>
                {suggestions.action_items_detected.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-[#2DD4BF] flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!transcript && !suggestions && (
          <p className="text-xs text-gray-400 text-center py-2">
            Start listening to get real-time AI suggestions
          </p>
        )}
      </div>
    </div>
  );
};
