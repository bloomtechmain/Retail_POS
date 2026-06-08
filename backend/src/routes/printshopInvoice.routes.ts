import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../controllers/printshopInvoice.controller';

const router = Router();
router.use(authenticate);

router.post('/',                                  ctrl.create);
router.get('/',                                   ctrl.list);
router.get('/customers/suggest',                  ctrl.customerSuggestions);
router.get('/credits/summary',                    ctrl.creditSummary);
router.get('/credits/customer/:customerName',     ctrl.customerInvoices);
router.get('/credits/full/:customerName',         ctrl.customerFullCredit);
router.get('/:id',                                ctrl.getById);
router.patch('/:id/payment',                      ctrl.payment);

export default router;
