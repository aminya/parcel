// @flow

import path from 'path';
import {Worker} from 'worker_threads';
import {ParcelNapi, type ParcelNapiOptions} from '@parcel/rust';

const WORKER_PATH = path.join(__dirname, 'worker', 'index.js');

export type ParcelV3Options = {|
  fs?: ParcelNapiOptions['fs'],
  nodeWorkers?: number,
  packageManager?: ParcelNapiOptions['packageManager'],
  threads?: number,
  tracerOptions?: ParcelNapiOptions['tracerOptions'],
  ...ParcelNapiOptions['options'],
|};

export class ParcelV3 {
  _internal: ParcelNapi;

  constructor({
    fs,
    nodeWorkers,
    packageManager,
    threads,
    tracerOptions,
    ...options
  }: ParcelV3Options) {
    this._internal = new ParcelNapi({
      fs,
      nodeWorkers,
      packageManager,
      threads,
      options,
      tracerOptions,
    });
  }

  async build(): Promise<any> {
    const workers = [];

    let result = await this._internal.build({
      registerWorker: tx_worker => {
        let worker = new Worker(WORKER_PATH, {
          workerData: {
            tx_worker,
          },
        });
        workers.push(worker);
      },
    });

    for (const worker of workers) worker.terminate();
    return result;
  }
}