import { createChild } from '@izod/core';
import { childOriginEvents, parentOriginEvents } from '@izod/playground-common';

async function main() {
  const container = document.getElementById('child-container');

  if (container) {
    const childApi = await createChild({
      container,
      url: 'http://127.0.0.1:3010',
      inboundEvents: childOriginEvents,
      outboundEvents: parentOriginEvents,
      handshakeOptions: {
        handshakeRetryInterval: 100,
      },
    });

    const childMessageList = document.getElementById('child-message-list');
    childApi.on('whisper', (data) => {
      const p = document.createElement('p');
      p.textContent = data.message;
      childMessageList?.appendChild(p);
    });
    childApi.on('answerQuestion', (data) => {
      const p = document.createElement('p');
      p.textContent = data.answer;
      childMessageList?.appendChild(p);
    });

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
          childApi.emit('askQuestion', { question: text });
        } else if (shoutRadio.checked) {
          childApi.emit('shout', { message: text });
        }

        textInput.value = '';
      },
      false,
    );
  }
}

main();
