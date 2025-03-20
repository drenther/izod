import { createChild } from '@izod/core';
import { childOriginEvents, parentOriginEvents } from '@izod/playground-common';

async function main() {
  const container = document.getElementById('child-container');

  if (container) {
    const child = createChild({
      container,
      url: 'http://localhost:3010',
      inboundEvents: childOriginEvents,
      outboundEvents: parentOriginEvents,
      handshakeOptions: {
        handshakeRetryInterval: 100,
      },
    });

    child.on('whisper', (data) => {
      const p = document.createElement('p');
      p.textContent = data.message;
      childMessageList?.appendChild(p);
    });
    child.on('answerQuestion', (data) => {
      const p = document.createElement('p');
      p.textContent = data.answer;
      childMessageList?.appendChild(p);
    });

    const api = await child.executeHandshake();

    const childMessageList = document.getElementById('child-message-list');

    const parentControlPanelForm = document.getElementById(
      'parent-control-panel-form',
    ) as HTMLFormElement;
    parentControlPanelForm.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        const textInput = document.getElementById(
          'parent-control-panel-input',
        ) as HTMLInputElement;
        const text = textInput.value;

        const questionRadio = document.querySelector(
          'input[id="parent-control-panel-question-radio"]',
        ) as HTMLInputElement;

        const shoutRadio = document.querySelector(
          'input[id="parent-control-panel-shout-radio"]',
        ) as HTMLInputElement;

        if (questionRadio.checked) {
          api.emit('askQuestion', { question: text });
        } else if (shoutRadio.checked) {
          api.emit('shout', { message: text });
        }

        textInput.value = '';
      },
      false,
    );
  }
}

main();
