#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    tsc_fs_rename_sync(STR_LIT("./old.txt"), STR_LIT("./new.txt"));
    return 0;
}
