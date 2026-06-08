import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as svc from '../services/printshopInvoice.service';

export const create = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await svc.createInvoice(req.body, req.user!.id);
    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

export const list = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await svc.getInvoices({
      page:          req.query.page          ? parseInt(req.query.page as string)  : 1,
      limit:         req.query.limit         ? parseInt(req.query.limit as string) : 20,
      payment_type:  req.query.payment_type  as string | undefined,
      customer_name: req.query.customer_name as string | undefined,
      status:        req.query.status        as string | undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

export const getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await svc.getInvoiceById(parseInt(req.params.id));
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

export const creditSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await svc.getCustomerCreditSummary(req.query.customer_name as string | undefined);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const customerInvoices = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await svc.getCustomerInvoices(decodeURIComponent(req.params.customerName));
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const payment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await svc.recordPayment(parseInt(req.params.id), parseFloat(req.body.amount));
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};
