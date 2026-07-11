import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { healthRouter } from './routes/health.js';
import { debugRouter } from './routes/debug.js';
import { worldsRouter } from './routes/worlds.js';
import { propsRouter } from './routes/props.js';
import { roomTemplatesRouter } from './routes/roomTemplates.js';
import { roomConnectionsRouter } from './routes/roomConnections.js';
import { expressionTypesRouter } from './routes/expressionTypes.js';
import { relationshipAxesRouter } from './routes/relationshipAxes.js';
import { charactersRouter } from './routes/characters.js';
import { outfitsRouter } from './routes/outfits.js';
import { playthroughsRouter } from './routes/playthroughs.js';
import { roomSessionsRouter } from './routes/roomSessions.js';
import { eventsRouter } from './routes/events.js';
import { settingsRouter } from './routes/settings.js';
import { itemsRouter } from './routes/items.js';
import { itemCategoriesRouter } from './routes/itemCategories.js';
import { actionCommandsRouter } from './routes/actionCommands.js';
import { characterStatusesRouter } from './routes/characterStatuses.js';
import { axisStatusTriggersRouter } from './routes/axisStatusTriggers.js';
import { contentBundleRouter } from './routes/contentBundle.js';
import { attachSocketServer } from './ws/socketServer.js';

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
app.use('/api/room-connections', roomConnectionsRouter);
app.use('/api/expression-types', expressionTypesRouter);
app.use('/api/relationship-axes', relationshipAxesRouter);
app.use('/api/characters', charactersRouter);
app.use('/api', outfitsRouter);
app.use('/api/playthroughs', playthroughsRouter);
app.use('/api/room-sessions', roomSessionsRouter);
app.use('/api', eventsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/item-categories', itemCategoriesRouter);
app.use('/api/action-commands', actionCommandsRouter);
app.use('/api/character-statuses', characterStatusesRouter);
app.use('/api/axis-status-triggers', axisStatusTriggersRouter);
app.use('/api/content-bundle', contentBundleRouter);

// Serves the built client (npm run build) so the app can run as a single
// process on the LAN without a separate Vite dev server. No-op in dev, since
// client/dist won't exist until a production build has been made.
const clientDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/images')) return next();
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

const server = http.createServer(app);
attachSocketServer(server);

server.listen(config.port, config.host, () => {
  console.log(`ChatRPG server listening on http://${config.host}:${config.port}`);
});
