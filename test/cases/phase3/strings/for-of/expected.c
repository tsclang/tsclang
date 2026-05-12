#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("hello");
    for (size_t _i_0 = 0; _i_0 < s.length; _i_0++) {
        const char ch = s.data[_i_0];
        printf("%c\n", ch);
    }
    return 0;
}
