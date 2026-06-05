import { Router } from 'express';
import * as internalUseController from '../controllers/internalUse.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', internalUseController.list);
router.get('/:id', internalUseController.getById);
router.post('/', internalUseController.create);

export default router;
