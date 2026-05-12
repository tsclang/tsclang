#include "runtime.h"
#include "std/fs.h"

static void _lambda_0_void(String event) {
    printf("%s\n", event.data);
}

int main(void) {
    TSC_INIT();
    tsc_fs_watch(STR_LIT("."), _lambda_0_void);
    return 0;
}
