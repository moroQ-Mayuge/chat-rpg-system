import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { healthRouter } from './routes/health.js';
import { debugRouter } from './routes/debug.js';
import { worldsRouter } from './routes/worlds.js';
import { propsRouter } from './routes/props.js';
import { roomTemplatesRouter } from './routes/roomTemplates.js';
import { expressionTypesRouter } from './routes/expressionTypes.js';
import { relationshipAxesRouter } from './routes/relationshipAxes.js';
import { charactersRouter } from './routes/characters.js';
import { outfitsRouter } from './routes/outfits.js';
import { playthroughsRouter } from './routes/playthroughs.js';
import { roomSessionsRouter } from './routes/roomSessions.js';

migrate();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/images', express.static(config.imageStorageDir));
app.use('/api', healthRouter);
app.use('/api/debug', debugRouter);
app.use('/api/worlds', worldsRouter);
app.use('/api/props', propsRouter);
app.use('/api/room-templates', roomTemplatesRouter);
app.use('/api/expression-types', expressionTypesRouter);
app.use('/api/relationship-axes', relationshipAxesRouter);
app.use('/api/characters', charactersRouter);
app.use('/api', outfitsRouter);
app.use('/api/playthroughs', playthroughsRouter);
app.use('/api/room-sessions', roomSessionsRouter);

const server = http.createServer(app);

server.listen(config.port, config.host, () => {
  console.log(`ChatRPG server listening on http://${config.host}:${config.port}`);
});
