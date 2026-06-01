# Cozy Kingdom Usagi Port

Side-by-side Usagi Engine port of the PixiJS cozy kingdom prototype.

Run locally with a supported Usagi install:

```sh
npm run usagi:dev
```

The official installer is documented at https://usagiengine.com/:

```sh
curl -fsSL https://usagiengine.com/install.sh | sh
```

This workspace keeps the PixiJS prototype unchanged. The Usagi version duplicates the simulation in Lua because Usagi is a separate Lua engine rather than a Pixi renderer backend.
