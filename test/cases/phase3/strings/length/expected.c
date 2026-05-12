#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    printf("%zu\n", s.length);
    return 0;
}
