#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    tsc_fs_mkdir_sync(STR_LIT("./output"));
    return 0;
}
