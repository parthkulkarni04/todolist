import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Mic, MicOff } from 'lucide-react';
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { createTask } from './graphql/mutations';
import { generateClient } from 'aws-amplify/api';
import { LexRuntimeV2Client, RecognizeTextCommand } from "@aws-sdk/client-lex-runtime-v2";
import { 
  TranscribeClient, 
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand 
} from "@aws-sdk/client-transcribe";
import { 
  S3Client, 
  PutObjectCommand,
  GetObjectCommand 
} from "@aws-sdk/client-s3";
import { fetchAuthSession } from 'aws-amplify/auth';

const client = generateClient();

const LexChatbot = ({ onTaskCreated }) => {
  // State management
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [lexClient, setLexClient] = useState(null);
  const [transcribeClient, setTranscribeClient] = useState(null);
  const [s3Client, setS3Client] = useState(null);
  const [recordingError, setRecordingError] = useState(null);
  
  const messagesEndRef = useRef(null);
  const audioChunks = useRef([]);

  // Initialize AWS clients
  useEffect(() => {
    initializeAWSClients();
  }, []);

  // Scroll to bottom effect
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const initializeAWSClients = async () => {
    try {
      const { credentials } = await fetchAuthSession();
      
      const lexClientInstance = new LexRuntimeV2Client({
        region: process.env.REACT_APP_AWS_REGION,
        credentials: credentials
      });
      
      const transcribeClientInstance = new TranscribeClient({
        region: process.env.REACT_APP_AWS_REGION,
        credentials: credentials
      });

      const s3ClientInstance = new S3Client({
        region: process.env.REACT_APP_AWS_REGION,
        credentials: credentials
      });
      
      setLexClient(lexClientInstance);
      setTranscribeClient(transcribeClientInstance);
      setS3Client(s3ClientInstance);
    } catch (error) {
      console.error('Error initializing AWS clients:', error);
      addMessage("There was an error initializing the chat service. Please try again later.", 'bot');
    }
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunks.current, { 
            type: 'audio/webm;codecs=opus' 
          });
          await handleAudioInput(audioBlob);
        } catch (error) {
          console.error('Error processing recording:', error);
          setRecordingError('Error processing recording');
          addMessage("Sorry, there was an error processing your recording. Please try again.", 'bot');
        }
      };

      recorder.onerror = (event) => {
        console.error('Recording error:', event.error);
        setRecordingError(event.error.message);
        addMessage("There was an error with the recording. Please try again.", 'bot');
      };

      recorder.start(1000); // Collect data in 1-second chunks
      setMediaRecorder(recorder);
      setIsRecording(true);
      addMessage("Listening... Click the microphone button again to stop.", 'bot');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setRecordingError('Error accessing microphone');
      addMessage("Unable to access microphone. Please check your permissions.", 'bot');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      addMessage("Processing your voice input...", 'bot');
    }
  };

  const handleAudioInput = async (audioBlob) => {
    setIsLoading(true);
    try {
      const transcribedText = await transcribeAudio(audioBlob);
      if (transcribedText && transcribedText.trim()) {
        addMessage(transcribedText, 'user');
        const lexResponse = await sendToLex(transcribedText);
        await handleLexResponse(lexResponse);
      } else {
        addMessage("Sorry, I couldn't understand the audio. Please try again.", 'bot');
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      addMessage("Sorry, there was an error processing your voice input.", 'bot');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadToS3 = async (audioBlob) => {
    const fileName = `audio-${Date.now()}.webm`;
    
    try {
      const command = new PutObjectCommand({
        Bucket: process.env.REACT_APP_S3_BUCKET,
        Key: fileName,
        Body: audioBlob,
        ContentType: 'audio/webm;codecs=opus'
      });

      await s3Client.send(command);
      return `s3://${process.env.REACT_APP_S3_BUCKET}/${fileName}`;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw error;
    }
  };

  const transcribeAudio = async (audioBlob) => {
    try {
      const s3Uri = await uploadToS3(audioBlob);
      const jobName = `task-transcription-${Date.now()}`;
      
      const command = new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: { MediaFileUri: s3Uri },
        MediaFormat: 'webm',
        LanguageCode: 'en-US',
        Settings: {
          ShowSpeakerLabels: false,
          EnableAutomaticPunctuation: true
        }
      });

      await transcribeClient.send(command);
      const transcribedText = await pollTranscriptionJob(jobName);
      return transcribedText;
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  };

  const pollTranscriptionJob = async (jobName) => {
    const maxAttempts = 60; // Maximum number of polling attempts (5 minutes total with 5-second intervals)
    const pollingInterval = 5000; // 5 seconds between attempts
    let attempts = 0;

    const getTranscriptionJob = async () => {
      const command = new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName
      });
      
      try {
        const response = await transcribeClient.send(command);
        return response.TranscriptionJob;
      } catch (error) {
        console.error('Error getting transcription job status:', error);
        throw error;
      }
    };

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const getTranscriptionText = async (transcriptFileUri) => {
      try {
        const url = new URL(transcriptFileUri);
        const bucket = url.hostname.split('.')[0];
        const key = url.pathname.substr(1);

        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key
        });

        const response = await s3Client.send(command);
        const transcript = await response.Body.transformToString();
        const transcriptJson = JSON.parse(transcript);
        
        return transcriptJson.results.transcripts[0].transcript;
      } catch (error) {
        console.error('Error getting transcription results:', error);
        throw error;
      }
    };

    while (attempts < maxAttempts) {
      const job = await getTranscriptionJob();
      
      switch (job.TranscriptionJobStatus) {
        case 'COMPLETED':
          return await getTranscriptionText(job.Transcript.TranscriptFileUri);
          
        case 'FAILED':
          throw new Error(`Transcription job failed: ${job.FailureReason}`);
          
        case 'IN_PROGRESS':
          await delay(pollingInterval);
          attempts++;
          break;
          
        default:
          throw new Error(`Unknown job status: ${job.TranscriptionJobStatus}`);
      }
    }

    throw new Error('Transcription timed out');
  };

  const createNewTask = async (taskDetails) => {
    try {
      const response = await client.graphql({
        query: createTask,
        variables: {
          input: {
            text: taskDetails.text,
            category: taskDetails.category || 'personal',
            priority: taskDetails.priority || 'medium',
            dueDate: taskDetails.dueDate || null,
            completed: false
          }
        },
        authMode: 'userPool'
      });
      
      if (onTaskCreated) {
        onTaskCreated();
      }
      
      return response.data.createTask;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  };

  const sendToLex = async (message) => {
    if (!lexClient) {
      addMessage("Chat service is initializing. Please try again in a moment.", 'bot');
      return null;
    }

    try {
      const params = {
        botId: process.env.REACT_APP_LEX_BOT_ID,
        botAliasId: process.env.REACT_APP_LEX_BOT_ALIAS_ID,
        localeId: "en_US",
        sessionId: `session-${Date.now()}`,
        text: message
      };

      const command = new RecognizeTextCommand(params);
      const response = await lexClient.send(command);

      return response;
    } catch (error) {
      console.error('Error communicating with Lex:', error);
      return null;
    }
  };

  const handleLexResponse = async (lexResponse) => {
    if (!lexResponse) {
      addMessage("Sorry, I'm having trouble understanding. Could you try again?", 'bot');
      return;
    }

    const intent = lexResponse.interpretations?.[0]?.intent?.name;
    const slots = lexResponse.interpretations?.[0]?.intent?.slots;

    if (intent === 'AddTask') {
      const taskDetails = {
        text: slots?.TaskDescription?.value?.interpretedValue || '',
        category: slots?.Category?.value?.interpretedValue?.toLowerCase() || 'personal',
        priority: slots?.Priority?.value?.interpretedValue?.toLowerCase() || 'medium',
        dueDate: slots?.DueDate?.value?.interpretedValue || null
      };

      try {
        await createNewTask(taskDetails);
        addMessage("I've added your task: " + taskDetails.text, 'bot');
      } catch (error) {
        addMessage("Sorry, I couldn't add your task. Please try again.", 'bot');
      }
    } else {
      addMessage(lexResponse.messages?.[0]?.content || "I'm not sure how to help with that.", 'bot');
    }
  };

  const addMessage = (text, sender) => {
    setMessages(prev => [...prev, { text, sender, timestamp: new Date() }]);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);
    addMessage(userMessage, 'user');

    const lexResponse = await sendToLex(userMessage);
    await handleLexResponse(lexResponse);
    
    setIsLoading(false);
  };

  return (
    <>
      <Button
        className="fixed bottom-4 right-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full p-4 shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <MessageCircle size={24} />
      </Button>

      {isOpen && (
        <div className="fixed bottom-20 right-4 w-80 bg-white rounded-lg shadow-xl overflow-hidden">
          <div className="bg-indigo-500 p-4 flex justify-between items-center">
            <h3 className="text-white font-semibold">Task Assistant</h3>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:text-indigo-200"
              onClick={() => setIsOpen(false)}
            >
              <X size={20} />
            </Button>
          </div>

          <div className="h-96 p-4 overflow-y-auto">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.sender === 'user'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-800 rounded-lg p-3">
                    {isRecording ? 'Recording...' : 'Processing...'}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="p-4 border-t">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex gap-2"
            >
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-grow"
                disabled={isRecording}
              />
              <Button
                type="button"
                size="icon"
                className={`${
                  isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'
                }`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? (
                  <MicOff size={20} className="text-white" />
                ) : (
                  <Mic size={20} className="text-white" />
                )}
              </Button>
              <Button type="submit" size="icon" className="bg-indigo-500 hover:bg-indigo-600">
                <Send size={20} className="text-white" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default LexChatbot;