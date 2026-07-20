const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/interactive');

// Interactive C++ test code that prompts for input
const cppCode = `
#include <iostream>
#include <string>

using namespace std;

int main() {
    string name;
    int age;
    
    cout << "--- Welcome to the C++ Sandbox ---" << endl;
    cout << "Please enter your name: ";
    if (cin >> name) {
        cout << "Hello, " << name << "!" << endl;
        cout << "Now enter your age: ";
        if (cin >> age) {
            cout << "Ah, " << age << " years old! That's a great age." << endl;
        }
    }   
    cout << "Goodbye!" << endl;
    return 0;
}
`;

ws.on('open', () => {
  console.log('Connected to WebSocket server.');
  console.log('Sending compilation and execution handshake payload...');

  // Send the initialization packet
  ws.send(JSON.stringify({
    type: 'init',
    language: 'cpp',
    code: cppCode
  }));
});

ws.on('message', (data) => {
  // Print any terminal logs sent back from the container PTY
  process.stdout.write(data.toString('utf-8'));
});

// Pipe user terminal input directly to the running container over WebSockets
process.stdin.on('data', (data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'input',
      input: data.toString()
    }));
  }
});

ws.on('close', (code, reason) => {
  console.log(`\nWebSocket connection closed by server. Exit Code: ${code}`);
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('WebSocket Error:', err.message);
});
