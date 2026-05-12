#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    const String all = {.data = s.data, .length = s.length, .capacity = 0};
    printf("%.*s\n", (int)all.length, all.data);
    return 0;
}
