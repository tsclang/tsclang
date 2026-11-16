#include "runtime.h"
#include "std/fs.h"

static void _lambda_0_void(void *_env, String event) {
    printf("%s\n", event.data);
}

static void _lambda_0_void_adapter(String _p0) {
    _lambda_0_void(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    tsc_fs_watch(STR_LIT("."), _lambda_0_void_adapter);
    return 0;
}
