import { Router } from 'express';
import * as expenseController from '../controllers/expense.controller';

const router = Router();

router.get('/',           expenseController.list);
router.get('/summary',    expenseController.summary);
router.get('/categories', expenseController.categories);
router.post('/',          expenseController.create);
router.delete('/:id',     expenseController.remove);

export default router;
