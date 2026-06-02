#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("A");
    const String nl = STR_LIT("\n");
    const String tab = STR_LIT("\t");
    printf("%s\n", s.data);
    printf("%s\n", nl.data);
    printf("%s\n", tab.data);
    tsc_string_release(tab);
    tsc_string_release(nl);
    tsc_string_release(s);
    return 0;
}
