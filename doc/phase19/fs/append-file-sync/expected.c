#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    tsc_fs_append_sync(STR_LIT("./log.txt"), STR_LIT("line\n"));
    return 0;
}
