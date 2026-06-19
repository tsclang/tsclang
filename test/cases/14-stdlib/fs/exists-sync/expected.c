#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    const bool ok = tsc_fs_exists_sync(STR_LIT("./data.txt"));
    printf("%s\n", (ok) ? "true" : "false");
    return 0;
}
