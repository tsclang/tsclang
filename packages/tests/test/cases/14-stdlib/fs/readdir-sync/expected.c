#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    const TscDirEntryArray entries = tsc_fs_readdir_sync(STR_LIT("."));
    printf("%zu\n", entries.length);
    return 0;
}
