import { CronJob } from "cron";
import { Router } from "express";
import { injectable } from "inversify";

@injectable()

export abstract class BaseModule {

    public abstract applyRoutes(app:Router): void;
    
    public abstract applyCron():void;

    protected scheduleCron(expression:string, callback:(Function)): void {
        const job = new CronJob(
            expression, 
            () => callback(),
        )
        job.start();
    }
}