#include "runtime.h"

int main(void) {
    TSC_INIT();
    String name = STR_LIT("world");
    int32_t age = 25;
    String s = tsc_string_format("%s is %ld", _tsc_str_to_ram(name).data, (long)age);
    tsc_print_str(s);
    printf("\n");
    tsc_string_release(s);
    tsc_string_release(name);
    return 0;
}
