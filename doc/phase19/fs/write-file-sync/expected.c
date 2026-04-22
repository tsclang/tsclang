#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    tsc_fs_write_sync(STR_LIT("./out.txt"), STR_LIT("hello"));
    return 0;
}
