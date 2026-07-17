import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      // route 用模板路径(/api/problems/:id)以免 cardinality 爆炸
      const route = req.route?.path
        ? `${req.baseUrl || ''}${req.route.path}`
        : req.path.replace(/\/\d+(\b|\/)/g, '/:id$1');
      const labels = { method: req.method, route, status: String(res.statusCode) };
      this.metrics.httpReqs.inc(labels);
      const sec = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpDur.observe({ method: req.method, route }, sec);
    });
    next();
  }
}
