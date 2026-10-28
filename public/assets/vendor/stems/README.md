# Local stem inference dependencies

- `demucs/`: unchanged installed `demucs-web@1.0.2` source, MIT, author timcsy. License retained. Source: https://github.com/timcsy/demucs-web . Copied from `sattari-seo-20261026/source/node_modules/demucs-web/src`.
- `ort/`: unchanged installed `onnxruntime-web@1.30.0` CPU ESM/WASM distribution, MIT, Microsoft. License retained from https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE . Copied from the same site's installed dependency.
- Model weights are NOT included. Explicit file import must match `stem-model.js` size/hash. No runtime remote request is made.

Model identity: HTDemucs converted by timcsy, revision `92e33df61cfc9eb820272aaa62d2ef6dcf4d950d`, file `htdemucs_embedded.onnx`, bytes180534758, SHA256 `e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077`.

Primary license evidence checked2026-10-26: [Meta Demucs](https://github.com/facebookresearch/demucs/blob/main/LICENSE) and its README declare MIT; [converter README](https://github.com/timcsy/demucs-web/blob/main/README.md) declares MIT and directly links this converted model repository. The [pinned model API](https://huggingface.co/api/models/timcsy/demucs-web-onnx/revision/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d) lists only `.gitattributes` and weights, without a separate model card/license field. Treating the converter-linked weights as its MIT artifact is an inference from these primary sources, not a separate model license declaration. Meta MIT notice retained in `DEMUCS-LICENSE`.

The original dependency contains a default remote model URL; Hole always supplies verified cache bytes to `loadModel(ArrayBuffer)`, and its worker CSP retains same-origin-only networking. No code path invokes the dependency's URL loader.
