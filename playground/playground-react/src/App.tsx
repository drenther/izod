import { parent } from '@izod/react';
import { childOriginEvents, parentOriginEvents } from '@izod/playground-common';
import { useCallback, useState } from 'react';

function App() {
  const { api } = parent.useConnect({
    inboundEvents: parentOriginEvents,
    outboundEvents: childOriginEvents,
  });

  const [data, setData] = useState<string[]>([]);
  parent.useEventListener<typeof parentOriginEvents, typeof childOriginEvents>(
    api,
    'askQuestion',
    useCallback((data) => {
      if ('question' in data) {
        setData((prev) => [...prev, `Question: ${data.question}`]);
      }
    }, []),
  );
  parent.useEventListener<typeof parentOriginEvents, typeof childOriginEvents>(
    api,
    'shout',
    useCallback((data) => {
      if ('message' in data) {
        setData((prev) => [...prev, `Message: ${data.message}`]);
      }
    }, []),
  );

  const [input, setInput] = useState<string>('');
  const [type, setType] =
    useState<keyof typeof childOriginEvents>('answerQuestion');

  return (
    <div
      style={{
        width: 200,
        height: 200,
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();

          api?.emit(
            type,
            type === 'answerQuestion'
              ? {
                  answer: input,
                }
              : {
                  message: input,
                },
          );

          setInput('');
        }}
      >
        <div>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>

        <div>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as keyof typeof childOriginEvents);
            }}
          >
            {Object.keys(childOriginEvents).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <button type="submit">Submit</button>
      </form>

      {data.map((item, index) => (
        <p key={index}>{item}</p>
      ))}
    </div>
  );
}

export default App;
