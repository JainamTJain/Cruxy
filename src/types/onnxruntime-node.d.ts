declare module "onnxruntime-node" {
  export class Tensor {
    constructor(
      type: string,
      data: Float32Array | Int32Array | BigInt64Array | string[],
      dims?: readonly number[],
    );
    readonly data: Float32Array | Int32Array | BigInt64Array | string[];
    readonly dims: number[];
  }

  export class InferenceSession {
    static create(
      path: string,
      options?: { executionProviders?: string[] },
    ): Promise<InferenceSession>;
    run(
      feeds: Record<string, Tensor>,
    ): Promise<Record<string, Tensor>>;
  }
}
