#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    const String s2 = s;
    printf("%s\n", s2.data);
    return 0;
}
