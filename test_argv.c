#include "runtime.h"

int main(int argc, char **argv) {
    TSC_INIT();
    Array_string _argv = tsc_make_argv(argc, argv);
    const int32_t args = tsc_string_slice(_argv, 2, (int32_t)_argv.length);
    printf("args: %d\n", args.join(STR_LIT(" ")));
    return 0;
}
