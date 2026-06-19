#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    tsc_fs_remove_sync(STR_LIT("./tmp.txt"));
    return 0;
}
