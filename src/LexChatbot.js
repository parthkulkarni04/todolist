import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { createTask } from './graphql/mutations';
import { generateClient } from 'aws-amplify/api';
import { LexRuntimeV2Client, RecognizeTextCommand } from "@aws-sdk/client-lex-runtime-v2";
import { fetchAuthSession } from 'aws-amplify/auth';

const client = generateClient();

const LexChatbot = ({ onTaskCreated }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [lexClient, setLexClient] = useState(null);

  useEffect(() => {
    initializeLexClient();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const initializeLexClient = async () => {
    try {
      const { credentials } = await fetchAuthSession();
      
      const client = new LexRuntimeV2Client({
        region: process.env.REACT_APP_AWS_REGION,
        credentials: credentials
      });
      
      setLexClient(client);
    } catch (error) {
      console.error('Error initializing Lex client:', error);
    }
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
        sessionId: "test-session",
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
                    Thinking...
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
              />
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