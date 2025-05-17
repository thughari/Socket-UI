import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { FormsModule } from '@angular/forms';

interface ChatMessage {
  sender: string;
  content: string;
  type: 'CHAT' | 'JOIN' | 'LEAVE';
  usersOnline?: number; // Optional, as it's only present in some messages
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  standalone : true,
  imports : [CommonModule, FormsModule]
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageArea') private messageArea!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  showUsernamePage = true;
  showChatPage = false;
  username: string | null = null;
  inputUsername = ''; // For the username input field
  newMessageContent = ''; // For the message input field

  stompClient: Client | null = null;
  connectingMessage = 'Connecting...';
  connectionError: string | null = null;
  onlineUsersCount = 0;

  messages: ChatMessage[] = [];

  private colors = [
    '#2196F3', '#32c787', '#00BCD4', '#ff5652',
    '#ffc107', '#ff85af', '#FF9800', '#39bbb0'
  ];

  private scrollToBottomNeeded = false;

  constructor() {}

  ngOnInit(): void {
    this.loadMessagesFromLocalStorage();
  }

  ngAfterViewChecked(): void {
    if (this.scrollToBottomNeeded) {
      this.scrollToBottom();
      this.scrollToBottomNeeded = false;
    }
  }

  ngOnDestroy(): void {
    if (this.stompClient && this.stompClient.active) {
      // Send LEAVE message
      if (this.username) {
        this.stompClient.publish({
          destination: '/app/chat.removeUser', // Assuming this is the endpoint for removing user
          body: JSON.stringify({ sender: this.username, type: 'LEAVE' })
        });
      }
      this.stompClient.deactivate();
      console.log('Disconnected from WebSocket.');
    }
    // Clear local storage on component destroy (optional, depends on desired behavior)
    // localStorage.removeItem('chatMessages');
  }

  connect(event: Event): void {
    event.preventDefault();
    this.username = this.inputUsername.trim();

    if (this.username) {
      this.showUsernamePage = false;
      this.showChatPage = true;
      this.connectingMessage = 'Connecting...';
      this.connectionError = null;

      // Note: SockJS URL should be absolute. If your Angular app and backend are on different ports during dev,
      // you might need a proxy configuration (proxy.conf.json) or ensure CORS is handled on the backend.
      // For simplicity, assuming backend is at localhost:8080.
      const socketFactory = () => new SockJS('http://localhost:8080/ws');

      this.stompClient = new Client({
        webSocketFactory: socketFactory,
        connectHeaders: {},
        debug: (str) => {
          console.log('STOMP DEBUG: ' + str);
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      this.stompClient.onConnect = (frame) => {
        this.onConnected();
      };

      this.stompClient.onStompError = (frame) => {
        this.onError('Broker reported error: ' + frame.headers['message'] + '. Additional details: ' + frame.body);
      };

      this.stompClient.onWebSocketError = (error) => {
        this.onError('WebSocket error: ' + error.toString());
      };

      this.stompClient.activate();
    }
  }

  private onConnected(): void {
    console.log('Connected to WebSocket!');
    this.connectingMessage = ''; // Or 'Connected!' or hide it

    if (this.stompClient && this.username) {
      // Subscribe to the Public Topic
      this.stompClient.subscribe('/topic/public', (payload: IMessage) => {
        this.onMessageReceived(JSON.parse(payload.body));
      });

      // Tell your username to the server
      this.stompClient.publish({
        destination: '/app/chat.addUser',
        body: JSON.stringify({ sender: this.username, type: 'JOIN' })
      });
    }
  }

  private onError(errorDetails: string): void {
    this.connectionError = `Could not connect to WebSocket server. ${errorDetails}. Please refresh this page to try again!`;
    this.connectingMessage = ''; // Clear connecting message
    console.error(errorDetails);
    // Optionally, revert to username page or show a persistent error
    // this.showChatPage = false;
    // this.showUsernamePage = true;
  }

  sendMessage(event: Event): void {
    event.preventDefault();
    const messageContent = this.newMessageContent.trim();
    if (messageContent && this.stompClient && this.stompClient.active && this.username) {
      const chatMessage: ChatMessage = {
        sender: this.username,
        content: messageContent,
        type: 'CHAT'
      };
      this.stompClient.publish({
        destination: '/app/chat.sendMessage',
        body: JSON.stringify(chatMessage)
      });
      this.newMessageContent = '';
      if (this.messageInput) {
        this.messageInput.nativeElement.focus();
      }
    }
  }

  private onMessageReceived(message: ChatMessage): void {
    console.log('Received message: ', message);

    if (message.usersOnline !== undefined) {
      this.updateOnlineUsers(message.usersOnline);
    }

    let displayMessage = { ...message }; // Clone to avoid modifying original if needed

    if (message.type === 'JOIN') {
      displayMessage.content = message.sender + ' joined!';
    } else if (message.type === 'LEAVE') {
      displayMessage.content = message.sender + ' left!';
    }
    // For CHAT type, content is already set

    this.messages.push(displayMessage);
    this.saveMessageToLocalStorage(displayMessage); // Save the processed message for display
    this.scrollToBottomNeeded = true;
  }

  private updateOnlineUsers(count: number): void {
    console.log('Online users count: ' + count);
    this.onlineUsersCount = count;
  }

  private saveMessageToLocalStorage(message: ChatMessage): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const currentMessages = JSON.parse(localStorage.getItem('chatMessages') || '[]') as ChatMessage[];
      currentMessages.push(message);
      localStorage.setItem('chatMessages', JSON.stringify(currentMessages));
    }
  }

  private loadMessagesFromLocalStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedMessages = JSON.parse(localStorage.getItem('chatMessages') || '[]') as ChatMessage[];
      this.messages = storedMessages.map(msg => {
        let displayMsg = { ...msg };
        if (msg.type === 'JOIN' && !msg.content.includes('joined!')) {
          displayMsg.content = msg.sender + ' joined!';
        } else if (msg.type === 'LEAVE' && !msg.content.includes('left!')) {
          displayMsg.content = msg.sender + ' left!';
        }
        return displayMsg;
      });
      if (this.messages.length > 0) {
        this.scrollToBottomNeeded = true;
      }
    } else {
      this.messages = [];
    }
  }

  getAvatarColor(messageSender: string): string {
    if (!messageSender) return '#ccc'; // Default color if sender is undefined
    let hash = 0;
    for (let i = 0; i < messageSender.length; i++) {
      hash = 31 * hash + messageSender.charCodeAt(i);
    }
    const index = Math.abs(hash % this.colors.length);
    return this.colors[index];
  }

  clearChat(): void {
    localStorage.removeItem('chatMessages');
    this.messages = [];
    // Optionally, notify server or other users, though typically clear chat is a local action
  }

  private scrollToBottom(): void {
    try {
      if (this.messageArea && this.messageArea.nativeElement) {
        this.messageArea.nativeElement.scrollTop = this.messageArea.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Could not scroll to bottom:', err);
    }
  }
}