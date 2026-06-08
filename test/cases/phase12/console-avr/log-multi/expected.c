#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 42;
    String s = STR_LIT("ok");
    printf("x= %d ", x);
    tsc_print_str(s);
    printf("\n");
    tsc_string_release(s);
    return 0;
}
