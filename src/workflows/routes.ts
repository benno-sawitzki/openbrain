import { Router } from 'express';
import type { WorkflowStorage } from './storage';
import { WorkflowEngine } from './engine';
import type { WorkflowDef } from './types';
import crypto from 'crypto';

interface WorkflowContext {
  storage: WorkflowStorage;
  engine: WorkflowEngine;
}

export function createWorkflowRouter(
  getContext: (req: any) => Promise<WorkflowContext>,
  authenticateRunToken: (req: any) => string | null,
): Router {
  const router = Router();

  // --- Definition endpoints ---

  router.get('/definitions', async (req, res) => {
    try {
      const { storage } = await getContext(req);
      const defs = await storage.listDefs();
      res.json(defs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/definitions', async (req, res) => {
    try {
      const { storage } = await getContext(req);
      const body = req.body;
      const def: WorkflowDef = {
        id: body.id || crypto.randomUUID(),
        name: body.name,
        description: body.description,
        steps: body.steps || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await storage.saveDef(def);
      res.json(def);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Run management endpoints ---

  router.get('/runs', async (req, res) => {
    try {
      const { storage } = await getContext(req);
      const filter: any = {};
      if (req.query.workflowId) filter.workflowId = req.query.workflowId;
      if (req.query.status) filter.status = req.query.status;
      const runs = await storage.listRuns(filter);
      res.json(runs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/runs', async (req, res) => {
    try {
      const { storage, engine } = await getContext(req);
      const { workflowId, task } = req.body;
      if (!workflowId || !task) return res.status(400).json({ error: 'workflowId and task required' });
      const def = await storage.getDef(workflowId);
      if (!def) return res.status(404).json({ error: 'Workflow not found' });
      const run = await engine.startRun(def, task);
      res.json(run);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get('/runs/:id', async (req, res) => {
    try {
      const { storage } = await getContext(req);
      const run = await storage.getRun(req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json(run);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/runs/:id/resume', async (req, res) => {
    try {
      const { engine } = await getContext(req);
      await engine.resumeRun(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/runs/:id/pause', async (req, res) => {
    try {
      const { engine } = await getContext(req);
      await engine.pauseRun(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/runs/:id', async (req, res) => {
    try {
      const { storage, engine } = await getContext(req);
      await engine.cancelRun(req.params.id);
      await storage.deleteRun(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Agent-facing endpoints (accept runToken auth) ---

  router.post('/claim/:agentId', async (req, res) => {
    try {
      const { engine } = await getContext(req);
      const runToken = authenticateRunToken(req) || undefined;
      const result = await engine.claimStep(req.params.agentId, runToken);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/complete/:stepId', async (req, res) => {
    try {
      const { engine } = await getContext(req);
      const output = req.body.output || '';
      const result = await engine.completeStep(req.params.stepId, output);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post('/fail/:stepId', async (req, res) => {
    try {
      const { engine } = await getContext(req);
      const error = req.body.error || 'Unknown error';
      const result = await engine.failStep(req.params.stepId, error);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
