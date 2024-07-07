// I interface with all adapters

import { AdapterLifx } from "./adapters/lifex.js";
import { AdapterTimer } from "./adapters/timer.js";
import { InterpreterAction } from "./interpreter.js";
import { timeout, unixTimestamp } from "./util.js";

export type AdapterActionResultScheduleAction = {
  type: "schedule";

  executeAt: number;

  actionId: string;
  actionProperties: any;
};

export type AdapterActionResultInterpreterMessage = {
  type: "interpreter-message";
  message: string;
};

export type AdapterActionResultTTS = {
  type: "tts";
  message: string;
};

export type AdapterActionResultSound = {
  type: "sound";
  data: Buffer;
};

export type AdapterActionResult = {
  success: true;
  results: Array<
    | AdapterActionResultScheduleAction
    | AdapterActionResultInterpreterMessage
    | AdapterActionResultTTS
    | AdapterActionResultSound
  >;
};

type AdapterActionSchedule = {
  status: "pending" | "running" | "finished";

  createdAt: number;
  executeAt: number;

  clientName: string;

  actionId: string;
  actionProperties: any;
};

type AdapterSubscription = {
  clientName: string;
  callback: (result: AdapterActionResult) => Promise<void>;
};

export class Adapter {
  private adapterTimer: AdapterTimer;
  private adapterLifx: AdapterLifx;

  private schedules: AdapterActionSchedule[] = [];

  private disruptLoop = false;

  private subscriptions: AdapterSubscription[] = [];

  constructor() {
    this.adapterTimer = new AdapterTimer();
    this.adapterLifx = new AdapterLifx();
  }

  public start = async () => {
    await this.adapterTimer.initialise();
    await this.adapterLifx.initialise();

    this.disruptLoop = false;
    this.loop();
  };

  public stop = async () => {
    this.disruptLoop = true;
  };

  private loop = async () => {
    while (!this.disruptLoop) {
      for (const schedule of this.schedules) {
        if (schedule.executeAt <= unixTimestamp()) {
          continue;
        }

        if (schedule.status !== "pending") {
          continue;
        }

        if (schedule.executeAt < unixTimestamp()) {
          continue;
        }

        schedule.status = "running";

        const result = await this.runAction(
          schedule.clientName,
          schedule.actionId,
          schedule.actionProperties
        );

        if (result) {
          this.publish(schedule.clientName, result);
        }

        schedule.status = "finished";
      }

      this.schedules = this.schedules.filter(
        (schedule) => schedule.status !== "finished"
      );

      await timeout(1000);
    }
  };

  public runAction = async (
    clientName: string,
    actionId: string,
    actionProperties: any
  ): Promise<AdapterActionResult | null> => {
    const resultTimer = await this.adapterTimer.runAction(
      actionId,
      actionProperties
    );

    if (resultTimer) {
      for (const actionResult of resultTimer.results) {
        if (actionResult.type === "schedule") {
          this.schedules.push({
            status: "pending",

            createdAt: unixTimestamp(),
            executeAt: actionResult.executeAt,

            clientName: clientName,

            actionId: actionResult.actionId,
            actionProperties: actionResult.actionProperties,
          });
        }
      }

      return resultTimer;
    }

    return null;
  };

  public getActions = async (): Promise<InterpreterAction[]> => {
    return [
      ...(await this.adapterTimer.getInterpreterActions()),
      ...(await this.adapterLifx.getInterpreterActions()),
    ];
  };

  public subscribe = (
    clientName: string,
    callback: AdapterSubscription["callback"]
  ) => {
    if (
      this.subscriptions.find(
        (subscription) => subscription.clientName === clientName
      )
    ) {
      throw new Error(`clientName already subscribed, ${clientName}`);
    }

    this.subscriptions.push({
      clientName: clientName,
      callback: callback,
    });
  };

  public unsubscribe = (clientName: string) => {
    const index = this.subscriptions.findIndex(
      (subscription) => subscription.clientName === clientName
    );

    if (index >= 0) {
      this.subscriptions.splice(index, 1);
    }
  };

  private publish = async (clientName: string, result: AdapterActionResult) => {
    const subscription = this.subscriptions.find(
      (sub) => sub.clientName === clientName
    );

    if (!subscription) {
      return;
    }

    await subscription.callback(result);
  };
}
