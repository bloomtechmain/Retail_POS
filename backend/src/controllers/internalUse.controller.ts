import { Response, NextFunction } from 'express';
import * as internalUseService from '../services/internalUse.service';
import { AuthRequest } from '../middleware/auth';

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await internalUseService.getInternalUses({
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      date_from: req.query.date_from as string,
      date_to: req.query.date_to as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await internalUseService.getInternalUseById(parseInt(req.params.id));
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const record = await internalUseService.createInternalUse(req.body, req.user!.id);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
};
