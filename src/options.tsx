import React from 'react';
import ReactDOM from 'react-dom/client';
import { Tooltip } from 'react-tooltip';
import Form from '@/components/Form/Form.tsx';
import '@/options.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Form />
    <Tooltip id="tooltip" place="top" />
  </React.StrictMode>,
);
