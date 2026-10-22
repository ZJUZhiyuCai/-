<?xml version="1.0" encoding="UTF-8"?>
<!--
// =====================================================
// Matrices
// =====================================================

// matrix translation (left, center, right)
matrix/l    = "<(ns)mtable columnalign='left'>$+$n#$-$n</(ns)mtable>";
matrix      = "<(ns)mtable>$+$n#$-$n</(ns)mtable>";
matrix/r    = "<(ns)mtable columnalign='right'>$+$n#$-$n</(ns)mtable>";

// matrix line translation (left, center, right)
matrow/l   = "<(ns)mtr columnalign='left'>$+$n#$-$n</(ns)mtr>$n";
matrow     = "<(ns)mtr>$+$n#$-$n</(ns)mtr>$n";
matrow/r   = "<(ns)mtr columnalign='right'>$+$n#$-$n</(ns)mtr>$n";

// matrix element translation (except for last element) (left, center, right)
matelem/l   = "<(ns)mtd columnalign='left'>$+$n#$-$n</(ns)mtd>$n";
matelem     = "<(ns)mtd>$+$n#$-$n</(ns)mtd>$n";
matelem/r   = "<(ns)mtd columnalign='right'>$+$n#$-$n</(ns)mtd>$n";

// matrix element translation (last element only) (left, center, right)
matelem/last/l   = "<(ns)mtd columnalign='left'>$+$n#$-$n</(ns)mtd>";
matelem/last     = "<(ns)mtd>$+$n#$-$n</(ns)mtd>";
matelem/last/r   = "<(ns)mtd columnalign='right'>$+$n#$-$n</(ns)mtd>";
 -->


<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xs="http://www.w3.org/2001/XMLSchema"
    exclude-result-prefixes="xs"
    version="1.0">

    <!-- Matrices TODO -->
    <xsl:template match="matrix[h_just='left']">
        <mtable columnalign="left">
            <xsl:variable name="rows" select="number(rows)"/>
            <xsl:apply-templates select="(slot | pile)[position() mod $rows = 1]" mode="rows-left" />
        </mtable>
    </xsl:template>

    <xsl:template match="matrix[h_just='center']">
        <mtable>
            <xsl:variable name="rows" select="number(rows)"/>
            <xsl:apply-templates select="(slot | pile)[position() mod $rows = 1]" mode="rows-center" />
        </mtable>
    </xsl:template>

    <xsl:template match="matrix[h_just='right']">
        <mtable columnalign="right">
            <xsl:variable name="rows" select="number(rows)"/>
            <xsl:apply-templates select="(slot | pile)[position() mod $rows = 1]" mode="rows-right" />
        </mtable>
    </xsl:template>

    <xsl:template match="slot | pile" mode="rows-left">
        <xsl:variable name="rows" select="number(parent::*/rows)"/>
        <mtr columnalign="left">
            <xsl:apply-templates select="." mode="columns-left" />
            <xsl:apply-templates select="(following-sibling::slot | following-sibling::pile)[position() &lt; $rows]" mode="columns-left" />
        </mtr>
    </xsl:template>

    <xsl:template match="slot | pile" mode="rows-center">
        <xsl:variable name="rows" select="number(parent::*/rows)"/>
        <mtr columnalign="center">
            <xsl:apply-templates select="." mode="columns-center" />
            <xsl:apply-templates select="(following-sibling::slot | following-sibling::pile)[position() &lt; $rows]" mode="columns-center" />
        </mtr>
    </xsl:template>

    <xsl:template match="slot | pile" mode="rows-right">
        <xsl:variable name="rows" select="number(parent::*/rows)"/>
        <mtr columnalign="right">
            <xsl:apply-templates select="." mode="columns-right" />
            <xsl:apply-templates select="(following-sibling::slot | following-sibling::pile)[position() &lt; $rows]" mode="columns-right" />
        </mtr>
    </xsl:template>

    <xsl:template match="pile" mode="columns-left">
        <mtd columnalign="left">
            <xsl:apply-templates select="."/>
        </mtd>
    </xsl:template>

    <xsl:template match="pile" mode="columns-center">
        <mtd columnalign="center">
            <xsl:apply-templates select="."/>
        </mtd>
    </xsl:template>

    <xsl:template match="pile" mode="columns-right">
        <mtd columnalign="right">
            <xsl:apply-templates select="."/>
        </mtd>
    </xsl:template>

    <xsl:template match="slot" mode="columns-left">
        <mtd columnalign="left">
            <xsl:apply-templates />
        </mtd>
    </xsl:template>

    <xsl:template match="slot" mode="columns-center">
        <mtd columnalign="center">
            <xsl:apply-templates />
        </mtd>
    </xsl:template>

    <xsl:template match="slot" mode="columns-right">
        <mtd columnalign="right">
            <xsl:apply-templates />
        </mtd>
    </xsl:template>

     <xsl:template match="matrix" priority="10">
        <!-- Shuye: preserve row/column slots; upstream flattened every cell
             into a one-column row, changing matrices and piecewise functions. -->
        <xsl:variable name="columns" select="number(cols)"/>
        <xsl:if test="$columns &lt; 1 or number(rows) &lt; 1 or count(slot | pile) != $columns * number(rows)">
            <xsl:message terminate="yes">Invalid MTEF matrix slot count</xsl:message>
        </xsl:if>
        <mtable>
            <xsl:for-each select="(slot | pile)[(position()-1) mod $columns = 0]">
                <mtr>
                    <xsl:for-each select=". | (following-sibling::slot | following-sibling::pile)[position() &lt; $columns]">
                        <mtd><xsl:apply-templates select="."/></mtd>
                    </xsl:for-each>
                </mtr>
            </xsl:for-each>
        </mtable>
    </xsl:template>
</xsl:stylesheet>
