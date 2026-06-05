import { Request, Response, NextFunction } from 'express';
import * as expenseService from '../services/expense.service';

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await expenseService.getExpenses({
      page:      parseInt(req.query.page as string) || 1,
      limit:     parseInt(req.query.limit as string) || 50,
      date_from: req.query.date_from as string,
      date_to:   req.query.date_to as string,
      category:  req.query.category as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const summary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateFrom = (req.query.date_from as string) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const dateTo   = (req.query.date_to   as string) || new Date().toISOString().slice(0, 10);
    const data = await expenseService.getSummary(dateFrom, dateTo);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const expense = await expenseService.createExpense(req.body, userId);
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await expenseService.deleteExpense(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const categories = (_req: Request, res: Response) => {
  res.json({ success: true, data: expenseService.EXPENSE_CATEGORIES });
};
