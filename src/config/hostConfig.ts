export const hostConfig = {
    Memory: 128 * 1024 * 1024,
    NanoCpus: 500000000,
    NetworkMode: 'none',
    AutoRemove: true,
    PidsLimit: 30,
    capDrop: ['All'],
    ReadonlyRootfs: false,
}