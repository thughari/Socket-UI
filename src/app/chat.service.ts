import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import SockJS from 'sockjs-client';
import { Client as StompClient, IMessage } from '@stomp/stompjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private stompClient: StompClient | null = null;
  public messages$ = new BehaviorSubject<any[]>([]);
  public usersOnline$ = new BehaviorSubject<number>(0);

  connect(username: string) {
    this.stompClient = new StompClient({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        this.stompClient?.subscribe('/topic/public', (message: IMessage) => {
          const msg = JSON.parse(message.body);
          this.handleMessage(msg);
        });
        this.stompClient?.publish({
          destination: "/app/chat.addUser",
          body: JSON.stringify({ sender: username, type: 'JOIN' })
        });
      }
    });
    this.stompClient.activate();
  }

  sendMessage(username: string, content: string) {
    if (this.stompClient && this.stompClient.connected) {
      const chatMessage = { sender: username, content, type: 'CHAT' };
      this.stompClient.publish({
        destination: "/app/chat.sendMessage",
        body: JSON.stringify(chatMessage)
      });
    }
  }

  handleMessage(message: any) {
    if (message.usersOnline !== undefined) {
      this.usersOnline$.next(message.usersOnline);
    }
    const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
    messages.push(message);
    localStorage.setItem('chatMessages', JSON.stringify(messages));
    this.messages$.next(messages);
  }

  loadMessages() {
    const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
    this.messages$.next(messages);
  }

  clearMessages() {
    localStorage.removeItem('chatMessages');
    this.messages$.next([]);
  }
}